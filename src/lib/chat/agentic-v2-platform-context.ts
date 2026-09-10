import type { AgenticV2Interaction } from "./agentic-v2-context";
import type { LoadAgenticV2SnapshotResult } from "./agentic-v2-snapshot";
import {
  buildPlatformContracts,
  type BuildPlatformContractsInput,
  type PlatformTaskContextV1,
} from "@/lib/agentic-v2/platform-contracts";
import { buildVerifiedAnalysis } from "@/lib/agentic-v2/verified-analysis";

interface PlatformContextFields {
  taskContext?: Record<string, unknown>;
  evidenceBundle?: Record<string, unknown>;
  jobSampleContext?: LoadAgenticV2SnapshotResult["jobSampleContext"];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveTask(
  interaction: AgenticV2Interaction | undefined,
  hasJobSample: boolean,
): {
  taskType: PlatformTaskContextV1["taskType"];
  purpose: PlatformTaskContextV1["purpose"];
  source: PlatformTaskContextV1["source"];
} {
  if (!interaction || interaction.action === "message_submit") {
    return {
      taskType: "general_chat",
      purpose: "read_only_report",
      source: hasJobSample ? "job_sample" : "chat",
    };
  }

  if (interaction.surface === "resources") {
    if (interaction.action === "analyze_job_gap") {
      return { taskType: "career_exploration", purpose: "read_only_report", source: "job_sample" };
    }
    if (interaction.action === "adjust_plan_for_job") {
      return { taskType: "growth_review", purpose: "interactive_artifact", source: "job_sample" };
    }
  }
  if (interaction.surface === "career_path") {
    if (interaction.action === "generate_plan" || interaction.action === "regenerate_plan") {
      return { taskType: "career_plan", purpose: "interactive_artifact", source: "career_path" };
    }
    if (interaction.action === "review_plan") {
      return { taskType: "growth_review", purpose: "interactive_artifact", source: "career_path" };
    }
  }
  if (interaction.surface === "learning_route") {
    return { taskType: "learning_route", purpose: "interactive_artifact", source: "career_path" };
  }
  if (interaction.surface === "career_exploration") {
    return { taskType: "career_exploration", purpose: "read_only_report", source: "chat" };
  }
  if (interaction.surface === "resume") {
    return { taskType: "resume_review", purpose: "interactive_artifact", source: "chat" };
  }
  if (interaction.surface === "growth_review" || interaction.surface === "dashboard") {
    return { taskType: "growth_review", purpose: "interactive_artifact", source: "chat" };
  }
  if (interaction.surface === "simulation") {
    return {
      taskType: interaction.action === "complete_simulation" ? "simulation_report" : "simulation_turn",
      purpose: "simulation",
      source: "simulation",
    };
  }
  if (hasJobSample) {
    return { taskType: "career_exploration", purpose: "read_only_report", source: "job_sample" };
  }
  return { taskType: "general_chat", purpose: "read_only_report", source: "chat" };
}

/**
 * 把本地快照转换为平台工作流可消费的三个输入中的两个。
 * 普通 message_submit 使用 general_chat，但仍携带同一份证据与版本上下文。
 * 主 Agent 若选择业务工作流，只能复制这些字段并替换 taskType，不能编造版本。
 */
export function buildPlatformContextFields(
  snapshot: LoadAgenticV2SnapshotResult,
  interaction?: AgenticV2Interaction,
): PlatformContextFields {
  const jobSampleContext = snapshot.jobSampleContext ?? null;
  const hasJobSample = jobSampleContext !== null;
  const task = resolveTask(interaction, hasJobSample);

  const profileData = record(snapshot.profileSnapshot.data) ?? {};
  const historyData = record(snapshot.historySnapshot.data) ?? {};
  const activePlan = record(historyData.activePlan);
  const activeLearningRoute = record(historyData.activeLearningRoute);
  const simulation = snapshot.simulationState;
  const expectedRound = simulation
    ? (task.taskType === "simulation_turn" ? simulation.round + 1 : simulation.round)
    : null;

  const contractInput: BuildPlatformContractsInput = {
    taskType: task.taskType,
    currentTime: snapshot.currentTime ?? new Date().toISOString(),
    timezone: snapshot.timezone ?? "Asia/Shanghai",
    profileVersion: snapshot.profileSnapshot.version,
    activePlanId: activePlan ? String(activePlan.id ?? "") || null : null,
    basePlanVersion: activePlan ? numberOrNull(activePlan.version) : null,
    // 快照加载成功即“已确认查询过路线状态”；null 表示已知不存在活动路线。
    activeLearningRouteKnown: true,
    baseRouteVersion: activeLearningRoute ? numberOrNull(activeLearningRoute.version) : null,
    weeklyBudgetHours: numberOrNull(profileData.weeklyAvailableHours),
    requestedPeriod: null,
    simulationState: simulation
      ? {
          sessionId: simulation.sessionId,
          scenarioKey: simulation.scenarioKey,
          round: simulation.round,
          expectedRound,
        }
      : null,
    expectedRound,
    purpose: task.purpose,
    source: task.source,
    profileSnapshot: snapshot.profileSnapshot,
    historySnapshot: snapshot.historySnapshot,
    careerBaseline: {
      available: false,
      roleKey: null,
      templateVersion: null,
      evidence: [],
    },
    marketEvidence: {
      searched: false,
      skipReason: "该页面动作未触发实时市场搜索；需要时由主智能体调用研究员 V2P",
      collectedAt: null,
      scope: { region: "未指定", experienceLevel: "未指定", timeRange: "未指定" },
      findings: [],
      sources: [],
      conflicts: [],
      confidence: "low",
    },
    jobSample: jobSampleContext,
  };
  const baseContracts = buildPlatformContracts(contractInput);
  const verifiedAnalysis = buildVerifiedAnalysis(snapshot, baseContracts.evidenceBundle);
  const contracts = buildPlatformContracts({
    ...contractInput,
    verifiedAnalysis,
  });

  return {
    taskContext: contracts.taskContext as unknown as Record<string, unknown>,
    evidenceBundle: contracts.evidenceBundle as unknown as Record<string, unknown>,
    ...(jobSampleContext ? { jobSampleContext } : {}),
  };
}
