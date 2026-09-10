import "server-only";
import { businessDataV1Schema, type BusinessDataV1, type ProfileSnapshotV1, type HistorySnapshotV1, type SimulationStateV1 } from "@/lib/agentic-v2/contracts";
import type { JobSampleContext } from "@/lib/jobs/context";
import { agenticV2InteractionSchema } from "./schemas";
import type { z } from "zod";

export { agenticV2InteractionSchema } from "./schemas";
export type AgenticV2Interaction = z.infer<typeof agenticV2InteractionSchema>;

export interface BuildAgenticV2BusinessDataInput {
  interaction?: AgenticV2Interaction;
  currentTime?: string;
  timezone?: string;
  executionMode?: "interactive" | "structured_api";
  responseContract?: string;
  taskContext?: Record<string, unknown>;
  evidenceBundle?: Record<string, unknown>;
  contextCoverage?: {
    algorithmVersion: string;
    generatedAt: string;
    included: string[];
    truncated: string[];
    missing: string[];
  };
  jobSampleContext?: JobSampleContext | null;
  profileSnapshot: ProfileSnapshotV1;
  historySnapshot: HistorySnapshotV1;
  simulationState: SimulationStateV1 | null;
}

const DEFAULT_INTERACTION: AgenticV2Interaction = {
  surface: "chat",
  action: "message_submit",
};

/**
 * 构建发送给 V2 Agent 的唯一私有上下文。
 * 接收已消毒的快照，不做任何数据库查询或 token 签名。
 * 权威数据始终保留在 CareerMate DB 中。
 */
export function buildAgenticV2BusinessData(
  input: BuildAgenticV2BusinessDataInput,
): BusinessDataV1 {
  const interaction = agenticV2InteractionSchema.parse(input.interaction ?? DEFAULT_INTERACTION);

  const data: Record<string, unknown> = {
    schemaVersion: "1",
    interaction,
    executionMode: input.executionMode ?? "interactive",
    responseContract: input.responseContract ?? "agent_artifact_v1",
    profileSnapshot: input.profileSnapshot,
    historySnapshot: input.historySnapshot,
    simulationState: input.simulationState,
    permissions: {
      candidateCreationAllowed: true,
      officialWritesAllowed: false,
    },
  };
  if (input.currentTime) data.currentTime = input.currentTime;
  if (input.timezone) data.timezone = input.timezone;
  if (input.taskContext) data.taskContext = input.taskContext;
  if (input.evidenceBundle) data.evidenceBundle = input.evidenceBundle;
  if (input.contextCoverage) data.contextCoverage = input.contextCoverage;
  if (input.jobSampleContext) data.jobSampleContext = input.jobSampleContext;
  return businessDataV1Schema.parse(data);
}
