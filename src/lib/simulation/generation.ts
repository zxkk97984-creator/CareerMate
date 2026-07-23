import { chatWithTbox } from "@/lib/tbox/adapter";
import { getTboxConfig } from "@/lib/env";
import { buildSimulationFeedback } from "@/lib/career";
import type { AiResult, NormalizedAssistantResult } from "@/lib/tbox/types";
import {
  simulationTurnResultSchema,
  type SimulationReportResult,
} from "@/lib/tbox/capability-schemas";
import { parseAgentArtifactEnvelope } from "@/lib/agentic-v2/artifact-envelope";
import type { AgentArtifactV1 } from "@/lib/agentic-v2/contracts";
import { containsSimulationTurnProtocol, type SimulationScenarioKey } from "../simulation";

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
  const expectedTurnIndex = history.filter((turn) => turn.role === "user").length;

  // API 模式：调用主 Agent
  if (config.mode === "api") {
    const result = await chatWithTbox({
      question: `场景：${input.scenarioTitle}。请根据对话历史给出下一轮追问。`,
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
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
      const data = artifact.data as Record<string, unknown> | null | undefined;
      const artifactScenarioKey = data?.scenarioKey as string | undefined;
      const artifactRound = data?.round as number | undefined;
      const nextQuestion = (data?.nextQuestion as string)?.trim();

      // 校验场景和回合匹配
      if (
        artifactScenarioKey === input.scenarioKey
        && (input.expectedRound === undefined || artifactRound === input.expectedRound)
        && nextQuestion
        && nextQuestion.length > 0
      ) {
        // 去重：检查是否已存在于转录中
        const existingQuestions = input.transcript
          .filter((t) => t.role === "assistant")
          .map((t) => normalizeQuestion(t.content));

        if (!existingQuestions.includes(normalizeQuestion(nextQuestion))) {
          return {
            data: {
              text: nextQuestion,
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
      // 场景/回合不匹配 → 降级
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
  result: { data: { text: string; citations: unknown[]; warnings: string[]; conversationId?: string | null }; meta: Record<string, unknown> },
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
    const result = await chatWithTbox({
      question: `场景：${input.scenarioTitle}。请根据以上模拟训练的完整对话记录，生成模拟训练报告。`,
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
    }, { config });

    if (result.meta.degraded) {
      return buildDegradedReport(input, result);
    }

    // ── V2 信封协议 ──
    const envelope = parseAgentArtifactEnvelope(result.data.text);

    if (
      envelope.artifact
      && envelope.artifact.taskType === "simulation_report"
    ) {
      const data = envelope.artifact.data as Record<string, unknown> | null | undefined;
      const artifactScenarioKey = data?.scenarioKey as string | undefined;

      if (artifactScenarioKey === input.scenarioKey) {
        const structured: SimulationReportResult = {
          type: "simulation_report",
          scenarioKey: input.scenarioKey,
          score: (data?.score as number) ?? 0,
          strengths: (data?.strengths as string[]) ?? [],
          improvements: (data?.improvements as string[]) ?? [],
          evidence: (data?.evidence as unknown[]) ?? [],
          abilityImpact: (data?.abilityImpact as Record<string, unknown>) ?? {},
          candidateUpdates: (data?.candidateUpdates as unknown[]) ?? [],
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
  result: { data: { text: string; citations: unknown[]; warnings: string[]; conversationId?: string | null }; meta: Record<string, unknown> },
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
