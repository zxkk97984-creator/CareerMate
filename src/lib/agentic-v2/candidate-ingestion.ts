import type { AgentArtifactV1 } from "./contracts";
import {
  AGENT_ARTIFACT_CANDIDATE_TYPES,
  type AgentArtifactCandidateService,
  type AgentArtifactCandidateType,
} from "./candidate-service";

// ── 任务类型到候选类型的确定性映射 ──────────────────────
const defaultCandidateTypeByTask: Record<AgentArtifactV1["taskType"], AgentArtifactCandidateType | null> = {
  profile_assessment: "profile_patch",
  career_plan: "career_plan",
  learning_route: "learning_route",
  simulation_report: "ability_evidence",
  resume_review: "ability_evidence",
  growth_review: "growth_replan",
  memory_item: "memory_item",
  career_template_draft: "career_template_draft",
  // 以下任务类型不创建候选：
  career_exploration: null,
  simulation_turn: null,
};

// ── 输入输出类型 ──────────────────────────────────────────
export interface IngestAgentArtifactInput {
  userId: string;
  conversationId: string;
  sessionId: string;
  clientRequestId: string;
  artifact?: AgentArtifactV1;
}

export interface IngestAgentArtifactResult {
  candidate?: {
    id: string;
    candidateType: AgentArtifactCandidateType;
    taskType: AgentArtifactV1["taskType"];
    summary: string;
  };
  warnings: string[];
}

/**
 * 将已验证的 artifact 摄入为候选（仅限 pending_confirmation + requiresUserConfirmation）。
 * 不在此处重复候选服务的 schema、版本、所有权或幂等性校验。
 */
export async function ingestAgentArtifact(
  input: IngestAgentArtifactInput,
  candidateService: AgentArtifactCandidateService,
): Promise<IngestAgentArtifactResult> {
  // 无 artifact → 无事可做
  if (!input.artifact) {
    return { warnings: [] };
  }

  const artifact = input.artifact;

  // 仅处理 pending_confirmation + requiresUserConfirmation
  if (artifact.status !== "pending_confirmation" || !artifact.requiresUserConfirmation) {
    return { warnings: [] };
  }

  // 查找候选类型映射
  const candidateType = defaultCandidateTypeByTask[artifact.taskType];
  if (!candidateType) {
    // career_exploration 或 simulation_turn → 不创建候选
    return { warnings: [] };
  }

  try {
    const candidate = await candidateService.createCandidate({
      userId: input.userId,
      candidateType,
      artifact,
      context: {
        sessionId: input.sessionId,
        conversationId: input.conversationId,
        idempotencyKey: input.clientRequestId,
      },
    });

    return {
      candidate: {
        id: candidate.id,
        candidateType: candidateType,
        taskType: artifact.taskType,
        summary: artifact.summary.slice(0, 500),
      },
      warnings: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知候选摄入错误";
    return {
      warnings: ["CANDIDATE_INGESTION_FAILED"],
    };
  }
}
