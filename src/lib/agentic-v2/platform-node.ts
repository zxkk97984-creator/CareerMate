import { validatedAgentArtifactV1Schema, type AgentArtifactV1 } from "./contracts";
import { platformTaskContextV1Schema, platformEvidenceBundleV1Schema } from "./platform-contracts";
import { normalizeArtifactMetadata, parseArtifactJson } from "./artifact-envelope";
import { normalizeSimulationScenarioArtifactData } from "./simulation-scenario-normalization";
import { assertPlanDataQuality } from "@/lib/plans/task-model";

type Event = { raw?: unknown; request?: unknown; task_context_json?: unknown; evidence_bundle_json?: unknown };
class Rejected extends Error { constructor(public code: string, message: string) { super(message); } }
const reject = (code: string, message: string): never => { throw new Rejected(code, message); };
const parseText = (value: unknown) => typeof value === "string" ? JSON.parse(value) : null;

const ARTIFACT_OPEN_TAG = "<CAREERMATE_ARTIFACT>";
const ARTIFACT_CLOSE_TAG = "</CAREERMATE_ARTIFACT>";

function looksLikeArtifact(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && ("schemaVersion" in value || "taskType" in value || "data" in value);
}

function rawText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["raw", "result", "text", "content", "output", "message"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key];
  }
  return null;
}

function stripArtifactTags(text: string): string {
  const open = text.indexOf(ARTIFACT_OPEN_TAG);
  const close = text.lastIndexOf(ARTIFACT_CLOSE_TAG);
  if (open >= 0 && close > open) {
    return text.slice(open + ARTIFACT_OPEN_TAG.length, close).trim();
  }
  return text.trim();
}

function stripCodeFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return fenced ? fenced[1].trim() : text.trim();
}

/** 从说明文字中提取完整 JSON 对象/数组，忽略字符串内部括号和转义字符。 */
function extractJsonSpans(text: string): string[] {
  const spans: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (start < 0) {
      if (char === "{" || char === "[") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        spans.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return spans;
}

function parsePlatformArtifact(raw: unknown): { value: unknown; warnings: string[] } | null {
  if (looksLikeArtifact(raw)) return { value: raw, warnings: [] };

  const text = rawText(raw);
  if (!text) return null;
  const candidates = [
    stripArtifactTags(text),
    stripCodeFence(text),
    ...extractJsonSpans(text),
  ].filter((candidate, index, all) => candidate.trim() && all.indexOf(candidate) === index);

  const parsedCandidates = candidates
    .map((candidate) => parseArtifactJson(candidate.trim()))
    .filter((candidate): candidate is { value: unknown; warnings: string[] } => candidate !== null);
  const artifactCandidates = parsedCandidates.filter((candidate) => looksLikeArtifact(candidate.value));
  return artifactCandidates[artifactCandidates.length - 1]
    ?? parsedCandidates[parsedCandidates.length - 1]
    ?? null;
}

/** Shared backend schema bundled into an offline exports.main code node; never writes data. */
export function validatePlatformNode(event: Event, allowed: AgentArtifactV1["taskType"][]): { artifact: AgentArtifactV1 } {
  let taskType = allowed[0];
  try {
    const parseInput = <T>(name: string, value: unknown, schema: { parse(value: unknown): T }): T => {
      try { return schema.parse(parseText(value)); }
      catch { return reject("INVALID_WORKFLOW_INPUT", `${name} 未通过 JSON/字段校验；请核对开始节点到代码节点的同名参数绑定，保留完整必填字段`); }
    };
    const input = {
      context: parseInput("task_context_json", event.task_context_json, platformTaskContextV1Schema),
      evidence: parseInput("evidence_bundle_json", event.evidence_bundle_json, platformEvidenceBundleV1Schema),
    };
    if (typeof event.request !== "string" || !event.request.trim()) {
      return failure(taskType, "INVALID_WORKFLOW_INPUT", "request 缺失或不是文本；请绑定开始节点的 request 参数");
    }
    if (event.raw == null || event.raw === "") {
      return failure(taskType, "WORKFLOW_OUTPUT_MISSING", "未收到大模型输出；请将代码节点 raw 绑定到大模型的结果文本，不能绑定开始参数或留空");
    }
    const { context, evidence } = input;
    if (allowed.includes(context.taskType as AgentArtifactV1["taskType"])) taskType = context.taskType as AgentArtifactV1["taskType"];
    const parsed = parsePlatformArtifact(event.raw);
    if (!parsed) return failure(taskType, "INVALID_JSON", "工作流输出不是一个合法 JSON 对象");
    const metadata = normalizeArtifactMetadata(parsed.value);
    const normalized = normalizeSimulationScenarioArtifactData(metadata.value, {
      sourceType: context.sourceType ?? "custom",
      sourceRef: context.sourceRef ?? null,
    });
    const result = validatedAgentArtifactV1Schema.safeParse(normalized);
    if (!result.success) return failure(taskType, "INVALID_ARTIFACT_SCHEMA", "输出不符合当前后端任务与状态契约");
    const artifact = result.data;
    if (!allowed.includes(artifact.taskType)) return failure(taskType, "TASK_TYPE_MISMATCH", "当前工作流不支持该任务");
    taskType = artifact.taskType;
    // Terminal non-business states must not be checked against success/pending data.
    if (artifact.status === "needs_input" || artifact.status === "error") return { artifact };
    if (context.taskType !== taskType) reject("TASK_CONTEXT_MISMATCH", "任务上下文与结果类型不一致");
    if (context.profileVersion !== evidence.profileSnapshot.version) reject("VERSION_MISMATCH", "画像版本不一致");
    const data = artifact.data as Record<string, any>;
    if (artifact.status === "pending_confirmation") {
      const planTask = ["career_plan", "growth_review", "learning_route"].includes(taskType);
      if (["profile_assessment", "resume_review", "simulation_report", "career_plan", "growth_review", "learning_route"].includes(taskType)) {
        const expected = planTask ? context.basePlanVersion : context.profileVersion;
        if (artifact.baseVersion !== expected) reject("VERSION_MISMATCH", "候选基准版本与输入不一致");
        if (!planTask && expected === null) reject("BASE_VERSION_REQUIRED", "缺少可保存候选所需的画像版本");
      }
    }
    if (taskType === "career_plan" || taskType === "growth_review") {
      try { assertPlanDataQuality(data); } catch { reject("PLAN_QUALITY_REJECTED", "计划动作缺少具体对象、投入、成果或验收要求"); }
      if (taskType === "growth_review" && (!context.activePlanId || data.planPatch?.parentPlanId !== context.activePlanId)) reject("PARENT_PLAN_MISMATCH", "复盘必须引用当前活动计划");
    }
    if (taskType === "learning_route") {
      if (!context.activeLearningRouteKnown || data.baseRouteVersion !== context.baseRouteVersion) reject("ROUTE_VERSION_MISMATCH", "缺少已核实的路线状态或版本不一致");
      if (data.weeklyBudgetHours !== context.weeklyBudgetHours) reject("BUDGET_MISMATCH", "周预算与已确认输入不一致");
      // Stage tasks are authoritative. Top-level tasks is an optional exact ordered copy.
      const tasks = data.stages.flatMap((stage: any) => stage.tasks);
      const canonical = (task: any) => JSON.stringify([task.id, task.weekIndex, task.title, task.description, task.estimatedHours, task.outputs, task.acceptanceCriteria]);
      if (data.tasks?.length && JSON.stringify(data.tasks.map(canonical)) !== JSON.stringify(tasks.map(canonical))) reject("TASK_LIST_MISMATCH", "tasks 与 stages.tasks 不一致");
      const match = /^(\d+)周$/.exec(data.period);
      if (!match || Number(match[1]) < 1) reject("INVALID_PERIOD", "请将确认周期转换为明确整数周，例如 4周；不能自行假定一个月等于四周");
      const weekCount = Number(match![1]);
      const ids = new Set(); const hours = new Map<number, number>();
      for (const task of tasks) {
        if (typeof task.id !== "string" || !task.id.trim() || ids.has(task.id) || !Number.isInteger(task.weekIndex) || task.weekIndex < 1 || task.weekIndex > weekCount) reject("INVALID_TASK_SCHEDULE", "每个任务需要唯一 id 和周期内的 weekIndex");
        ids.add(task.id);
        hours.set(task.weekIndex, (hours.get(task.weekIndex) ?? 0) + task.estimatedHours);
      }
      if ([...hours.values()].some((h) => h > data.weeklyBudgetHours + 1e-8)) reject("WEEKLY_BUDGET_EXCEEDED", "至少一周任务总时长超过已确认预算");
    }
    if (taskType === "simulation_turn" || taskType === "simulation_report") {
      const state = context.simulationState;
      if (!state) reject("MISSING_SIMULATION_STATE", "缺少本场已保存的训练状态");
      if (artifact.status === "success" && (data.sessionId !== state!.sessionId || data.scenarioKey !== state!.scenarioKey)) reject("SIMULATION_STATE_MISMATCH", "会话或场景与输入不一致");
      if (taskType === "simulation_turn" && (context.expectedRound === null || data.round !== context.expectedRound)) reject("ROUND_MISMATCH", "追问轮次必须等于 expectedRound，不再次加一");
    }
    if (taskType === "career_exploration") {
      const keys = new Set(data.options.flatMap((o: any) => [o.roleKey, o.roleName]).filter(Boolean));
      if (data.recommendedOrder?.some((key: string) => !keys.has(key))) reject("INVALID_RECOMMENDED_ORDER", "推荐顺序引用了不存在的职业");
    }
    return { artifact };
  } catch (error) {
    return failure(taskType, error instanceof Rejected ? error.code : "INVALID_OUTPUT", error instanceof Rejected ? error.message : "输出校验失败，请重新生成");
  }
}
function failure(taskType: AgentArtifactV1["taskType"], code: string, message: string): { artifact: AgentArtifactV1 } {
  return { artifact: { schemaVersion: "1.0", taskType, status: "error", summary: message, data: { code, message, recoverable: true }, evidence: [], sources: [], assumptions: [], warnings: [], requiresUserConfirmation: false, baseVersion: null, nextActions: [] } };
}
