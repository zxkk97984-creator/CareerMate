import "server-only";
import { businessDataV1Schema, type BusinessDataV1, type ProfileSnapshotV1, type HistorySnapshotV1, type SimulationStateV1 } from "@/lib/agentic-v2/contracts";
import { agenticV2InteractionSchema } from "./schemas";
import type { z } from "zod";

export { agenticV2InteractionSchema } from "./schemas";
export type AgenticV2Interaction = z.infer<typeof agenticV2InteractionSchema>;

export interface BuildAgenticV2BusinessDataInput {
  interaction?: AgenticV2Interaction;
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

  return businessDataV1Schema.parse({
    schemaVersion: "1",
    interaction,
    profileSnapshot: input.profileSnapshot,
    historySnapshot: input.historySnapshot,
    simulationState: input.simulationState,
    permissions: {
      candidateCreationAllowed: true,
      officialWritesAllowed: false,
    },
  });
}
