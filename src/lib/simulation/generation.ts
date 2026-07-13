import { chatWithTbox } from "@/lib/tbox/adapter";
import { parseStructuredAssistantResult } from "@/lib/tbox/structured-result";
import { getTboxConfig } from "@/lib/env";
import { buildSimulationFeedback } from "@/lib/career";
import type { AiResult, NormalizedAssistantResult } from "@/lib/tbox/types";
import type { SimulationReportResult } from "@/lib/tbox/capability-schemas";
import type { SimulationScenarioKey } from "../simulation";
import type { AiExecutionMeta } from "@/lib/types";

interface SimulationTranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

/** 生成单轮模拟训练助手回复 */
export async function generateSimulationTurn(input: {
  userId: string;
  scenarioKey: SimulationScenarioKey;
  scenarioTitle: string;
  transcript: SimulationTranscriptTurn[];
  remoteConversationId?: string;
}): Promise<AiResult<NormalizedAssistantResult>> {
  const config = getTboxConfig();
  const history = input.transcript.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  // API 模式：调用主 Agent
  if (config.mode === "api") {
    return chatWithTbox({
      question: `场景：${input.scenarioTitle}。请根据对话历史给出下一轮追问。`,
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
    }, { config });
  }

  // manual/mock 降级（此处 config.mode 已排除 "api"）
  const degradedMode = config.mode; // "manual" | "mock"
  return {
    data: {
      text: "请根据场景继续回答。",
      conversationId: input.remoteConversationId,
      citations: [],
      warnings: ["degraded"],
    },
    meta: {
      requestedMode: degradedMode,
      actualMode: degradedMode,
      degraded: true,
      fallbackReason: "degraded",
      source: degradedMode === "manual" ? "manual-fixture" : "local-mock",
    },
  };
}

/** 生成模拟训练完成报告（通过主 Agent 结构化结果） */
export async function generateSimulationReport(input: {
  userId: string;
  scenarioKey: SimulationScenarioKey;
  scenarioTitle: string;
  transcript: SimulationTranscriptTurn[];
  remoteConversationId?: string;
}): Promise<AiResult<NormalizedAssistantResult>> {
  const config = getTboxConfig();
  const history = input.transcript.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  // API 模式：调用主 Agent 生成结构化报告
  if (config.mode === "api") {
    const result = await chatWithTbox({
      question: `场景：${input.scenarioTitle}。请根据以上模拟训练的完整对话记录，生成模拟训练报告。要求以JSON返回，包含type为simulation_report、评分score、优点strengths、改进点improvements、证据evidence和候选更新candidateUpdates。`,
      userId: input.userId,
      conversationId: input.remoteConversationId,
      history,
    }, { config });

    // 尝试解析结构化结果
    const parsed = parseStructuredAssistantResult(result.data);
    return { data: parsed, meta: result.meta };
  }

  // manual/mock 降级（此处 config.mode 已排除 "api"）
  const degradedMode = config.mode; // "manual" | "mock"
  const userAnswers = input.transcript
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("\n");
  const feedback = buildSimulationFeedback({
    scenarioKey: input.scenarioKey,
    scenarioTitle: input.scenarioTitle,
    userAnswer: userAnswers,
  });

  const manualSource = degradedMode === "manual" ? "manual-fixture" : "local-mock";
  return {
    data: {
      text: JSON.stringify(feedback),
      structured: {
        type: "simulation_report",
        scenarioKey: input.scenarioKey,
        score: feedback.score,
        strengths: feedback.strengths,
        improvements: feedback.improvements,
        evidence: [],
        abilityImpact: feedback.abilityImpact,
        candidateUpdates: [],
      } as SimulationReportResult,
      conversationId: input.remoteConversationId,
      citations: [],
      warnings: ["degraded"],
    },
    meta: {
      requestedMode: degradedMode,
      actualMode: degradedMode,
      degraded: true,
      fallbackReason: "degraded",
      source: manualSource,
    },
  };
}
