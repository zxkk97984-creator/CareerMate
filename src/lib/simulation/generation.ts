import { z } from "zod";
import { chatWithTbox } from "@/lib/tbox/adapter";
import { getTboxConfig } from "@/lib/env";
import { buildSimulationFeedback } from "@/lib/career";
import type { AiResult, NormalizedAssistantResult } from "@/lib/tbox/types";
import {
  type SimulationReportResult,
} from "@/lib/tbox/capability-schemas";
import { parseAgentArtifactEnvelope } from "@/lib/agentic-v2/artifact-envelope";
import type { AgentArtifactV1 } from "@/lib/agentic-v2/contracts";
import { containsSimulationTurnProtocol, type SimulationScenarioKey } from "../simulation";

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

    const result = await chatWithTbox({
      question: `场景：${input.scenarioTitle}。请根据对话历史给出下一轮追问。`,
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
      context: businessContext,
    }, { config });

    // ── V2 信封协议：从文本中提取 CAREERMATE_ARTIFACT ──
    const envelope = parseAgentArtifactEnvelope(result.data.text);
    const artifact: AgentArtifactV1 | undefined = envelope.artifact;

    // 尝试从信封中获取 simulation_turn
    if (
      artifact
      && artifact.taskType === "simulation_turn"
      && artifact.status === "success"
      && artifact.requiresUserConfirmation === false
    ) {
      // Zod 严格校验 data
      const parsed = simulationTurnDataSchema.safeParse(artifact.data);
      if (parsed.success) {
        const d = parsed.data;

        // 校验场景、会话和回合匹配
        if (
          d.scenarioKey === input.scenarioKey
          && (input.sessionId === undefined || d.sessionId === input.sessionId)
          && (input.expectedRound === undefined || d.round === input.expectedRound)
          && d.isComplete === false
        ) {
          // 去重：检查是否已存在于转录中
          const existingQuestions = input.transcript
            .filter((t) => t.role === "assistant")
            .map((t) => normalizeQuestion(t.content));

          if (!existingQuestions.includes(normalizeQuestion(d.nextQuestion))) {
            return {
              data: {
                text: d.nextQuestion,
                conversationId: result.data.conversationId ?? input.remoteConversationId,
                citations: result.data.citations ?? [],
                warnings: [...new Set([...result.data.warnings, ...envelope.warnings])],
                structured: undefined,
              },
              meta: result.meta,
            };
          }
          // 重复问题 → 使用本地降级
          return buildLocalFallback(input, result, "REPEATED_QUESTION");
        }
      }
      // schema/场景/回合不匹配 → 降级
      return buildLocalFallback(input, result, "SCHEMA_MISMATCH");
    }

    // 无信封或无效 —— 尝试旧 protocol 兼容
    const protocolText = containsSimulationTurnProtocol(result.data.text);
    if (protocolText && envelope.warnings.length > 0) {
      return buildLocalFallback(input, result, "SCHEMA_MISMATCH");
    }

    // 无结构化内容 → 返回纯文本
    return {
      data: {
        text: envelope.displayText || result.data.text,
        conversationId: result.data.conversationId ?? input.remoteConversationId,
        citations: result.data.citations ?? [],
        warnings: [...new Set([...result.data.warnings, ...envelope.warnings])],
        structured: undefined,
      },
      meta: result.meta,
    };
  }

  // manual/mock 降级
  return buildLocalFallback(input, { data: { text: "", citations: [], warnings: [], conversationId: input.remoteConversationId }, meta: {} as any }, "degraded");
}

/** 构建本地降级响应 */
function buildLocalFallback(
  input: { scenarioKey: SimulationScenarioKey; scenarioTitle: string; transcript: SimulationTranscriptTurn[]; remoteConversationId?: string },
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

    const result = await chatWithTbox({
      question: `场景：${input.scenarioTitle}。请根据以上模拟训练的完整对话记录，生成模拟训练报告。`,
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
      context: reportContext,
    }, { config });

    if (result.meta.degraded) {
      return buildDegradedReport(input, result);
    }

    // ── V2 信封协议 ──
    const envelope = parseAgentArtifactEnvelope(result.data.text);

    if (
      envelope.artifact
      && envelope.artifact.taskType === "simulation_report"
      && envelope.artifact.status === "success"
    ) {
      // Zod 严格校验
      const parsed = simulationReportDataSchema.safeParse(envelope.artifact.data);
      if (parsed.success) {
        const d = parsed.data;

        if (d.scenarioKey === input.scenarioKey
          && (input.sessionId === undefined || d.sessionId === input.sessionId)
          && (
            d.candidateUpdates.length === 0
            || envelope.artifact.requiresUserConfirmation === true
          )
        ) {
          const structured: SimulationReportResult = {
            type: "simulation_report",
            scenarioKey: input.scenarioKey,
            score: d.score,
            strengths: d.strengths,
            improvements: d.improvements,
            evidence: d.evidence,
            abilityImpact: d.abilityImpact,
            candidateUpdates: d.candidateUpdates as SimulationReportResult["candidateUpdates"],
          };

          return {
            data: {
              text: envelope.displayText,
              structured,
              conversationId: result.data.conversationId ?? input.remoteConversationId,
              citations: result.data.citations ?? [],
              warnings: [...new Set([...result.data.warnings, ...envelope.warnings])],
            },
            meta: result.meta,
          };
        }
      }
    }

    // 无有效信封 → 降级报告
    return buildDegradedReport(input, result);
  }

  // manual/mock 降级
  return buildDegradedReport(input, {
    data: { text: "", citations: [], warnings: ["degraded"], conversationId: input.remoteConversationId },
    meta: {},
  });
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
