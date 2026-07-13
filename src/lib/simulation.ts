import { z } from "zod";
import { parseJson } from "@/lib/json";
import type { AiExecutionMeta } from "@/lib/types";

export const simulationScenarioKeys = [
  "cross_role_communication",
  "ai_office",
  "remote_collaboration",
] as const;
export type SimulationScenarioKey = (typeof simulationScenarioKeys)[number];
export const simulationScenarioSchema = z.enum(simulationScenarioKeys);

const scenarios: Record<SimulationScenarioKey, { title: string; openingMessage: string; prompts: string[] }> = {
  cross_role_communication: {
    title: "跨岗位沟通",
    openingMessage: "你是产品同学，我是技术负责人。请先说明 AI 简历分析功能要解决的用户问题和核心目标。",
    prompts: ["请补充优先级和验收标准。", "出现文件解析失败时如何处理？", "你会如何向非技术同学解释能力边界？", "请明确依赖、负责人和下一步。", "最后用三句话总结方案。"],
  },
  ai_office: {
    title: "AI 辅助办公",
    openingMessage: "请把一次产品例会整理成行动项，并说明你准备如何使用 AI 工具提升效率。",
    prompts: ["怎样核验 AI 生成内容的准确性？", "哪些信息不应该提交给外部 AI？", "请给出可量化的效率指标。", "如何让团队复用这套流程？", "最后总结风险和改进点。"],
  },
  remote_collaboration: {
    title: "远程协作",
    openingMessage: "项目出现延期风险，请先写一段异步进度同步，说明现状、影响和下一步。",
    prompts: ["请明确依赖方和截止时间。", "如果关键成员没有回复，你会怎样升级风险？", "如何记录决策并避免信息遗漏？", "请补充一个备选方案。", "最后给出可执行的收尾清单。"],
  },
};

export interface SimulationTranscriptTurn {
  role: "user" | "assistant";
  content: string;
  meta?: AiExecutionMeta;
}

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8_000),
  meta: z.object({
    requestedMode: z.enum(["api", "manual", "mock"]),
    actualMode: z.enum(["api", "manual", "mock"]),
    degraded: z.boolean(),
    fallbackReason: z.string().nullable(),
    source: z.string(),
  }).optional(),
});

export function parseSimulationTranscript(value: string): SimulationTranscriptTurn[] {
  const raw = parseJson<unknown>(value, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = turnSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function getSimulationScenario(key: SimulationScenarioKey) {
  return { key, ...scenarios[key] };
}

export function nextSimulationPrompt(key: SimulationScenarioKey, turnCount: number) {
  const prompts = scenarios[key].prompts;
  return prompts[Math.min(Math.max(turnCount - 1, 0), prompts.length - 1)]!;
}

export function canCompleteSimulation(turnCount: number) {
  return turnCount >= 3 && turnCount <= 6;
}

export function simulationDto(session: {
  id: string; scenarioKey: string; scenarioTitle: string; transcript: string; score: number | null;
  feedback: string; status: string; turnCount: number; requestedMode: string; actualMode: string;
  candidateId: string | null; remoteConversationId?: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: session.id,
    scenarioKey: session.scenarioKey,
    scenarioTitle: session.scenarioTitle,
    transcript: parseSimulationTranscript(session.transcript),
    score: session.score,
    feedback: parseJson<unknown>(session.feedback, {}),
    status: session.status,
    turnCount: session.turnCount,
    requestedMode: session.requestedMode,
    actualMode: session.actualMode,
    candidateId: session.candidateId,
    remoteConversationId: session.remoteConversationId ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
