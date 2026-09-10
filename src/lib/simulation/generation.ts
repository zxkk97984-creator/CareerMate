import { z } from "zod";
import { chatWithTbox } from "@/lib/tbox/adapter";
import { getTboxConfig } from "@/lib/env";
import { buildSimulationFeedback } from "@/lib/career";
import type { AiResult, NormalizedAssistantResult } from "@/lib/tbox/types";
import {
  simulationReportResultSchema,
  type SimulationReportResult,
} from "@/lib/tbox/capability-schemas";
import { parseAgentArtifactEnvelope } from "@/lib/agentic-v2/artifact-envelope";
import { simulationScenarioDataSchema, type AgentArtifactV1 } from "@/lib/agentic-v2/contracts";
import { buildPlatformContracts } from "@/lib/agentic-v2/platform-contracts";
import {
  buildCustomScenario,
  type CustomScenarioInput,
  type SimulationScenarioKey,
  type SimulationScenarioSnapshot,
} from "../simulation";

// ── 严格 Zod 校验 ────────────────────────────────────────
const simulationTurnDataSchema = z.object({
  sessionId: z.string().trim().min(1),
  scenarioKey: z.string().trim().min(1),
  round: z.number().int().nonnegative(),
  nextQuestion: z.string().trim().min(1),
  isComplete: z.literal(false),
}).strict();

const simulationReportDataSchema = z.object({
  sessionId: z.string().trim().min(1),
  scenarioKey: z.string().trim().min(1),
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  evidence: z.array(z.string()),
  abilityImpact: z.record(z.string(), z.number()),
  candidateUpdates: z.array(z.unknown()),
}).strict();

interface SimulationTranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GeneratedSimulationScenario {
  scenarioSnapshot: SimulationScenarioSnapshot;
  sourceType: "custom";
  sourceRef: null;
}

/** 归一化问题文本用于去重比较 */
function normalizeQuestion(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[？?！!。，,、\s]+/g, "")
    .replace(/[：:]+/g, "");
}

/** 生成单轮模拟训练助手回复 */
export async function generateSimulationTurn(input: {
  userId: string;
  scenarioKey: SimulationScenarioKey;
  scenarioTitle: string;
  transcript: SimulationTranscriptTurn[];
  remoteConversationId?: string;
  sessionId?: string;
  expectedRound?: number;
  scenarioSnapshot?: SimulationScenarioSnapshot | null;
}): Promise<AiResult<NormalizedAssistantResult>> {
  const config = getTboxConfig();
  const history = input.transcript.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
  // API 模式：调用主 Agent
  if (config.mode === "api") {
    // 构建 business_data.simulationState context
    const businessContext = input.sessionId ? {
      schemaVersion: "1",
      simulationState: {
        sessionId: input.sessionId,
        scenarioKey: input.scenarioKey,
        status: "in_progress",
        round: input.expectedRound ?? 0,
        transcript: history.slice(-12),
      },
      permissions: { candidateCreationAllowed: true, officialWritesAllowed: false },
    } : undefined;

    const snapshot = input.scenarioSnapshot;
    const scenarioContext = snapshot
      ? `固定场景：你的角色=${snapshot.role}；对话对象=${snapshot.counterpart}；目标=${snapshot.objective}；难度=${snapshot.difficulty}；情境=${snapshot.brief}；评分维度=${snapshot.scoringDimensions.join("、")}；预设追问=${snapshot.prompts.join(" / ")}。`
      : "";
    const commonRequest = {
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
      context: businessContext,
      searchPolicy: "off" as const,
    };
    const prompts = [
      `场景：${input.scenarioTitle}。${scenarioContext}请根据对话历史给出下一轮追问。不要联网、不要解释、不要 Markdown 围栏；只输出一个 <CAREERMATE_ARTIFACT>...</CAREERMATE_ARTIFACT>，taskType=simulation_turn。`,
      `请只输出下面这一个标签，不要联网、不要解释、不要 Markdown 围栏：\n<CAREERMATE_ARTIFACT>\n{"schemaVersion":"1.0","taskType":"simulation_turn","status":"success","summary":"下一轮追问","data":{"sessionId":"${input.sessionId ?? ""}","scenarioKey":"${input.scenarioKey}","round":${input.expectedRound ?? 0},"nextQuestion":"请按照当前训练场景继续追问一个问题。","isComplete":false},"evidence":[],"sources":[],"assumptions":[],"warnings":[],"requiresUserConfirmation":false,"baseVersion":null,"nextActions":[]}\n</CAREERMATE_ARTIFACT>`,
    ];

    let lastResult: AiResult<NormalizedAssistantResult> | null = null;
    let lastRepeated = false;
    let hadInvalidEnvelope = false;
    for (const prompt of prompts) {
      const result = await chatWithTbox({ ...commonRequest, question: prompt }, { config });
      lastResult = result;
      const parsed = parseSimulationTurnResult(input, result);
      if (parsed && "ok" in parsed) {
        return {
          data: {
            text: parsed.text,
            conversationId: result.data.conversationId ?? input.remoteConversationId,
            citations: result.data.citations ?? [],
            warnings: parsed.warnings,
            structured: undefined,
          },
          meta: result.meta,
        };
      }
      const hasOk = parsed !== null && "ok" in parsed;
      const hasRepeated = parsed !== null && "repeated" in parsed;
      if (hasRepeated) lastRepeated = true;
      if (
        result.data.text.includes("<CAREERMATE_ARTIFACT>")
        && !hasOk
        && !hasRepeated
      ) {
        hadInvalidEnvelope = true;
      }
    }

    const finalResult = lastResult ?? {
      data: { text: "", citations: [], warnings: ["degraded"], conversationId: input.remoteConversationId },
      meta: {
        requestedMode: config.mode,
        actualMode: config.mode,
        degraded: true,
        fallbackReason: "degraded",
        source: "local-mock",
      },
    };
    if (finalResult.meta?.degraded || lastRepeated || hadInvalidEnvelope) {
      return buildLocalFallback(
        input,
        finalResult,
        lastRepeated ? "REPEATED_QUESTION" : "SCHEMA_MISMATCH",
      );
    }
    return {
      data: {
        text: finalResult.data.text,
        conversationId: finalResult.data.conversationId ?? input.remoteConversationId,
        citations: finalResult.data.citations ?? [],
        warnings: finalResult.data.warnings,
        structured: undefined,
      },
      meta: finalResult.meta,
    };
  }

  // manual/mock 降级
  return buildLocalFallback(input, { data: { text: "", citations: [], warnings: [], conversationId: input.remoteConversationId }, meta: {} as any }, "degraded");
}

/**
 * 自定义场景生成：优先调用主 Agent 的 V2场景生成工作流；
 * 失败或降级时使用本地模板，并明确返回 degraded 元数据。
 */
export async function generateSimulationScenario(input: {
  userId: string;
  request: string;
  custom: CustomScenarioInput;
}): Promise<AiResult<GeneratedSimulationScenario>> {
  const config = getTboxConfig();
  const fallback = (meta: AiResult<NormalizedAssistantResult>["meta"], reason: string) => ({
    data: {
      scenarioSnapshot: buildCustomScenario(input.custom),
      sourceType: "custom" as const,
      sourceRef: null,
    },
    meta: {
      ...meta,
      actualMode: config.mode === "api" ? "mock" as const : config.mode,
      degraded: true,
      fallbackReason: reason,
      source: "local-simulation-scenario-fallback",
    },
  });

  if (config.mode !== "api") {
    return fallback({
      requestedMode: config.mode,
      actualMode: config.mode,
      degraded: false,
      fallbackReason: null,
      source: "local-mock",
    }, "degraded");
  }

  const contracts = buildPlatformContracts({
    taskType: "simulation_scenario",
    currentTime: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    profileVersion: null,
    activePlanId: null,
    basePlanVersion: null,
    activeLearningRouteKnown: false,
    baseRouteVersion: null,
    weeklyBudgetHours: null,
    requestedPeriod: null,
    simulationState: null,
    expectedRound: null,
    sourceType: "custom",
    sourceRef: null,
    purpose: "interactive_artifact",
    source: "simulation",
    profileSnapshot: { available: false, version: null, data: null },
    historySnapshot: { available: false, through: null, data: null },
    careerBaseline: { available: false, roleKey: null, templateVersion: null, evidence: [] },
    marketEvidence: {
      searched: false,
      skipReason: "自定义场景生成不需要实时市场搜索",
      collectedAt: null,
      scope: { region: "全国", experienceLevel: "未指定", timeRange: "本轮" },
      findings: [],
      sources: [],
      conflicts: [],
      confidence: "low",
    },
  });
  const prompt = [
    "你是 CareerMate V2 的场景生成任务路由器。",
    "必须调用已绑定的【V2场景生成】工作流；不得自行生成 simulation_scenario JSON。",
    "调用工作流时传入以下三个文本参数：",
    `request=${JSON.stringify([
      input.request,
      `你的角色：${input.custom.role}`,
      `对话对象：${input.custom.counterpart}`,
      `训练目标：${input.custom.objective}`,
      `难度：${input.custom.difficulty}`,
    ].join("\n"))}`,
    `task_context_json=${JSON.stringify(contracts.taskContext)}`,
    `evidence_bundle_json=${JSON.stringify(contracts.evidenceBundle)}`,
    "工作流返回后，只输出其结束节点 artifact 的 <CAREERMATE_ARTIFACT>...</CAREERMATE_ARTIFACT> 信封，不得改写、重生成或补充第二份 JSON。",
    "顶层必须包含 schemaVersion=\"1.0\"、taskType=\"simulation_scenario\"、status=\"success\"。",
    "scenarioSnapshot 必须严格包含 key、title、difficulty、durationMinutes、skills、role、counterpart、objective、brief、openingMessage、prompts、scoringDimensions。",
    "prompts 和 scoringDimensions 必须是字符串数组，不能输出对象数组；skills 也必须是字符串数组。",
    "所有字符串内部优先使用中文引号“”，不要使用未转义的 ASCII 双引号；换行写成 \\n，不要输出真实换行。",
    "不要联网，不要 Markdown 围栏，不要解释。",
  ].join("\n");

  try {
    const result = await chatWithTbox({
      question: prompt,
      userId: input.userId,
      searchPolicy: "off",
    }, { config });
    const envelope = parseAgentArtifactEnvelope(result.data.text, {
      simulationScenarioDefaults: { sourceType: "custom", sourceRef: null },
    });
    if (
      envelope.artifact?.taskType === "simulation_scenario"
      && envelope.artifact.status === "success"
    ) {
      const parsed = simulationScenarioDataSchema.safeParse(envelope.artifact.data);
      if (parsed.success && parsed.data.sourceType === "custom") {
        return {
          data: {
            scenarioSnapshot: parsed.data.scenarioSnapshot,
            sourceType: "custom",
            sourceRef: null,
          },
          meta: result.meta,
        };
      }
    }
    return fallback(result.meta, "SCHEMA_MISMATCH");
  } catch (error) {
    return fallback({
      requestedMode: "api",
      actualMode: "mock",
      degraded: true,
      fallbackReason: "provider_error",
      source: "local-mock",
    }, error instanceof Error ? error.message.slice(0, 120) : "provider_error");
  }
}

/**
 * 从一次单轮调用中提取严格 V2 simulation_turn。
 * ok=true 表示可用；repeated=true 表示信封有效但问题重复；null 表示无效。
 */
function parseSimulationTurnResult(
  input: {
    scenarioKey: SimulationScenarioKey;
    sessionId?: string;
    expectedRound?: number;
    transcript: SimulationTranscriptTurn[];
  },
  result: AiResult<NormalizedAssistantResult>,
): { ok: true; text: string; warnings: string[] } | { repeated: true } | null {
  const envelope = parseAgentArtifactEnvelope(result.data.text);
  const artifact: AgentArtifactV1 | undefined = envelope.artifact;
  if (
    artifact
    && artifact.taskType === "simulation_turn"
    && artifact.status === "success"
    && artifact.requiresUserConfirmation === false
  ) {
    const parsed = simulationTurnDataSchema.safeParse(artifact.data);
    if (parsed.success) {
      const d = parsed.data;
      if (
        d.scenarioKey === input.scenarioKey
        && (input.sessionId === undefined || d.sessionId === input.sessionId)
        && (input.expectedRound === undefined || d.round === input.expectedRound)
        && d.isComplete === false
      ) {
        const existingQuestions = input.transcript
          .filter((t) => t.role === "assistant")
          .map((t) => normalizeQuestion(t.content));
        if (!existingQuestions.includes(normalizeQuestion(d.nextQuestion))) {
          return {
            ok: true,
            text: d.nextQuestion,
            warnings: [...new Set([...result.data.warnings, ...envelope.warnings])],
          };
        }
        return { repeated: true };
      }
    }
  }
  return null;
}

/** 构建本地降级响应 */
function buildLocalFallback(
  input: { scenarioKey: SimulationScenarioKey; scenarioTitle: string; transcript: SimulationTranscriptTurn[]; remoteConversationId?: string; scenarioSnapshot?: SimulationScenarioSnapshot | null },
  result: { data: { text: string; citations?: unknown[]; warnings: string[]; conversationId?: string | null }; meta: { degraded?: boolean; requestedMode?: string; actualMode?: string; fallbackReason?: string | null; source?: string } },
  reason: string,
): AiResult<NormalizedAssistantResult> {
  const config = getTboxConfig();
  const degradedMode = config.mode === "api" ? "mock" : config.mode;
  return {
    data: {
      text: "",
      conversationId: input.remoteConversationId,
      citations: [],
      warnings: [...new Set([...result.data.warnings, reason])],
      structured: undefined,
    },
    meta: {
      requestedMode: config.mode,
      actualMode: degradedMode,
      degraded: true,
      fallbackReason: reason,
      source: degradedMode === "manual" ? "manual-fixture" : "local-mock",
    },
  };
}

/** 生成模拟训练完成报告 */
export async function generateSimulationReport(input: {
  userId: string;
  scenarioKey: SimulationScenarioKey;
  scenarioTitle: string;
  transcript: SimulationTranscriptTurn[];
  remoteConversationId?: string;
  sessionId?: string;
  scenarioSnapshot?: SimulationScenarioSnapshot | null;
}): Promise<AiResult<NormalizedAssistantResult>> {
  const config = getTboxConfig();
  const history = input.transcript.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  // API 模式：调用主 Agent 生成结构化报告
  if (config.mode === "api") {
    const reportContext = input.sessionId ? {
      schemaVersion: "1",
      simulationState: {
        sessionId: input.sessionId,
        scenarioKey: input.scenarioKey,
        status: "completing",
        round: history.filter((t) => t.role === "user").length,
        transcript: history.slice(-12),
      },
      permissions: { candidateCreationAllowed: true, officialWritesAllowed: false },
    } : undefined;

    const snapshot = input.scenarioSnapshot;
    const scenarioContext = snapshot
      ? `固定场景：你的角色=${snapshot.role}；对话对象=${snapshot.counterpart}；目标=${snapshot.objective}；难度=${snapshot.difficulty}；情境=${snapshot.brief}；评分维度=${snapshot.scoringDimensions.join("、")}。`
      : "";
    const commonRequest = {
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
      context: reportContext,
      searchPolicy: "off" as const,
    };
    const prompts = [
      `场景：${input.scenarioTitle}。${scenarioContext}请根据以上模拟训练的完整对话记录，生成模拟训练报告。不要联网、不要输出解释或 Markdown 代码围栏；只输出一个 <CAREERMATE_ARTIFACT>...</CAREERMATE_ARTIFACT>，JSON 必须严格符合 simulation_report 精确数据契约，data 只包含 sessionId、scenarioKey、score、strengths、improvements、evidence、abilityImpact、candidateUpdates。`,
      `请只输出下面这一个标签，不要联网、不要解释、不要 Markdown 围栏：\n<CAREERMATE_ARTIFACT>\n{"schemaVersion":"1.0","taskType":"simulation_report","status":"success","summary":"模拟训练报告","data":{"sessionId":"${input.sessionId ?? ""}","scenarioKey":"${input.scenarioKey}","score":78,"strengths":["优势"],"improvements":["改进项"],"evidence":["证据"],"abilityImpact":{"communication":72},"candidateUpdates":[{"field":"abilityScores.communication","newValue":72,"confidence":0.85,"reason":"理由","evidenceExcerpt":"证据","impactSummary":"影响","requiresConfirmation":true}]},"evidence":[],"sources":[],"assumptions":[],"warnings":[],"requiresUserConfirmation":true,"baseVersion":null,"nextActions":[]}\n</CAREERMATE_ARTIFACT>`,
    ];

    let lastResult: AiResult<NormalizedAssistantResult> | null = null;
    for (const prompt of prompts) {
      const result = await chatWithTbox({ ...commonRequest, question: prompt }, { config });
      lastResult = result;
      const parsed = parseSimulationReportResult(input, result);
      if (parsed) {
        return {
          data: {
            text: parsed.text,
            structured: parsed.structured,
            conversationId: result.data.conversationId ?? input.remoteConversationId,
            citations: result.data.citations ?? [],
            warnings: parsed.warnings,
          },
          meta: result.meta,
        };
      }
    }

    // 两次都无有效报告 → 降级报告
    return buildDegradedReport(input, lastResult ?? {
      data: { text: "", citations: [], warnings: ["degraded"], conversationId: input.remoteConversationId },
      meta: {},
    });
  }

  // manual/mock 降级
  return buildDegradedReport(input, {
    data: { text: "", citations: [], warnings: ["degraded"], conversationId: input.remoteConversationId },
    meta: {},
  });
}

/**
 * 从一次报告调用中提取严格 V2 信封或正文报告 JSON。
 * 返回 null 表示本次调用没有可接受的结构化报告。
 */
function parseSimulationReportResult(
  input: { scenarioKey: SimulationScenarioKey; sessionId?: string },
  result: AiResult<NormalizedAssistantResult>,
): { structured: SimulationReportResult; text: string; warnings: string[] } | null {
  // ── V2 信封协议 ──
  const envelope = parseAgentArtifactEnvelope(result.data.text);
  if (
    envelope.artifact
    && envelope.artifact.taskType === "simulation_report"
    && envelope.artifact.status === "success"
  ) {
    const parsed = simulationReportDataSchema.safeParse(envelope.artifact.data);
    if (parsed.success) {
      const d = parsed.data;
      if (
        d.scenarioKey === input.scenarioKey
        && (input.sessionId === undefined || d.sessionId === input.sessionId)
        && (d.candidateUpdates.length === 0 || envelope.artifact.requiresUserConfirmation === true)
      ) {
        return {
          structured: {
            type: "simulation_report",
            scenarioKey: input.scenarioKey,
            score: d.score,
            strengths: d.strengths,
            improvements: d.improvements,
            evidence: d.evidence,
            abilityImpact: d.abilityImpact,
            candidateUpdates: d.candidateUpdates as SimulationReportResult["candidateUpdates"],
          },
          text: envelope.displayText,
          warnings: [...new Set([...result.data.warnings, ...envelope.warnings])],
        };
      }
    }
  }

  // 平台能力缺口：真实 API 不返回 structured 字段 → 从正文提取报告 JSON（fenced / 整段 / 括号切片）
  const extractedReport = extractReportJsonFromText(result.data.text);
  if (extractedReport !== undefined) {
    const candidate =
      typeof extractedReport === "object" && extractedReport !== null && !Array.isArray(extractedReport)
        ? ("type" in extractedReport
            ? extractedReport
            : { type: "simulation_report", ...(extractedReport as Record<string, unknown>) })
        : extractedReport;
    const parsedReport = simulationReportResultSchema.safeParse(candidate);
    if (parsedReport.success && parsedReport.data.scenarioKey === input.scenarioKey) {
      return {
        structured: {
          type: "simulation_report",
          scenarioKey: input.scenarioKey,
          score: parsedReport.data.score,
          strengths: parsedReport.data.strengths,
          improvements: parsedReport.data.improvements,
          evidence: parsedReport.data.evidence,
          abilityImpact: parsedReport.data.abilityImpact,
          candidateUpdates: parsedReport.data.candidateUpdates,
        },
        text: result.data.text,
        warnings: [...new Set([...result.data.warnings, "REPORT_EXTRACTED_FROM_TEXT"])],
      };
    }
  }

  return null;
}

/** 平台不返回 structured 字段时，从正文提取报告 JSON（fenced / 整段 / 括号切片） */
function extractReportJsonFromText(text: string): unknown | undefined {
  if (!text.trim()) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ }
  }
  try { return JSON.parse(text.trim()); } catch { /* continue */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
  }
  return undefined;
}

/** 构建降级报告 */
function buildDegradedReport(
  input: { scenarioKey: SimulationScenarioKey; scenarioTitle: string; transcript: SimulationTranscriptTurn[]; remoteConversationId?: string },
  result: { data: { text: string; citations?: unknown[]; warnings: string[]; conversationId?: string | null }; meta: { degraded?: boolean; requestedMode?: string; actualMode?: string; fallbackReason?: string | null; source?: string } },
): AiResult<NormalizedAssistantResult> {
  const config = getTboxConfig();
  const userAnswers = input.transcript
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("\n");
  const feedback = buildSimulationFeedback({
    scenarioKey: input.scenarioKey,
    scenarioTitle: input.scenarioTitle,
    userAnswer: userAnswers,
  });

  const structured: SimulationReportResult = {
    type: "simulation_report",
    scenarioKey: input.scenarioKey,
    score: feedback.score,
    strengths: feedback.strengths,
    improvements: feedback.improvements,
    evidence: [],
    abilityImpact: feedback.abilityImpact,
    candidateUpdates: [],
  };

  const degradedMode = config.mode === "api" ? "mock" : config.mode;
  const manualSource = degradedMode === "manual" ? "manual-fixture" : "local-mock";

  return {
    data: {
      text: JSON.stringify(feedback),
      structured,
      conversationId: input.remoteConversationId,
      citations: [],
      warnings: [...new Set([...result.data.warnings, "degraded"])],
    },
    meta: {
      requestedMode: config.mode,
      actualMode: degradedMode,
      degraded: true,
      fallbackReason: "degraded",
      source: manualSource,
    },
  };
}
