import { getPrisma } from "@/lib/prisma";
import { agentArtifactV1Schema, type AgentArtifactV1 } from "./contracts";

export const AGENT_ARTIFACT_CANDIDATE_TYPES = [
  "profile_patch",
  "ability_evidence",
  "career_plan",
  "learning_route",
  "growth_replan",
  "memory_item",
  "career_template_draft",
] as const;

export type AgentArtifactCandidateType = (typeof AGENT_ARTIFACT_CANDIDATE_TYPES)[number];

const allowedCandidateTypes = new Set<string>(AGENT_ARTIFACT_CANDIDATE_TYPES);

const COMPATIBLE_TASK_TYPES: Record<AgentArtifactCandidateType, readonly AgentArtifactV1["taskType"][]> = {
  profile_patch: ["profile_assessment"],
  ability_evidence: ["profile_assessment", "simulation_report", "resume_review", "growth_review"],
  career_plan: ["career_plan"],
  learning_route: ["learning_route"],
  growth_replan: ["growth_review"],
  memory_item: ["memory_item"],
  career_template_draft: ["career_exploration", "career_template_draft"],
};

const VERSIONED_CANDIDATE_TYPES = new Set<AgentArtifactCandidateType>([
  "profile_patch",
  "ability_evidence",
  "career_plan",
  "learning_route",
  "growth_replan",
]);

export class AgentArtifactCandidateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AgentArtifactCandidateError";
  }
}

interface CandidateTransaction {
  chatConversation: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  agentArtifactCandidate: {
    upsert(args: {
      where: {
        userId_sourceSessionId_idempotencyKey: {
          userId: string;
          sourceSessionId: string;
          idempotencyKey: string;
        };
      };
      create: {
        userId: string;
        sourceSessionId: string;
        idempotencyKey: string;
        candidateType: AgentArtifactCandidateType;
        status: "pending";
        artifact: string;
        baseVersion: number | null;
        sourceConversationId: string | null;
      };
      update: Record<string, never>;
      select: {
        id: true;
        status: true;
        candidateType: true;
        artifact: true;
        baseVersion: true;
        sourceSessionId: true;
        sourceConversationId: true;
      };
    }): Promise<{
      id: string;
      status: string;
      candidateType: string;
      artifact: string;
      baseVersion: number | null;
      sourceSessionId: string;
      sourceConversationId: string | null;
    }>;
  };
}

interface CandidateDatabase {
  $transaction<T>(operation: (transaction: CandidateTransaction) => Promise<T>): Promise<T>;
}

export interface CreateAgentArtifactCandidateInput {
  userId: string;
  context: {
    sessionId: string;
    conversationId?: string | null;
    idempotencyKey: string;
  };
  candidateType: AgentArtifactCandidateType;
  artifact: AgentArtifactV1 | unknown;
}

export interface CreatedAgentArtifactCandidate {
  id: string;
  status: string;
  candidateType: string;
}

export interface AgentArtifactCandidateService {
  createCandidate(input: CreateAgentArtifactCandidateInput): Promise<CreatedAgentArtifactCandidate>;
}

function requiredIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentArtifactCandidateError(`${field} is required`, "INVALID_CONTEXT", 400);
  }
  return value.trim();
}

function validateArtifact(value: unknown): AgentArtifactV1 {
  const result = agentArtifactV1Schema.safeParse(value);
  if (!result.success) {
    throw new AgentArtifactCandidateError(
      "Artifact does not satisfy AgentArtifactV1",
      "INVALID_ARTIFACT",
      400,
    );
  }
  if (result.data.status !== "pending_confirmation") {
    throw new AgentArtifactCandidateError(
      "Only pending-confirmation artifacts can become candidates",
      "ARTIFACT_NOT_PENDING",
      400,
    );
  }
  if (!result.data.requiresUserConfirmation) {
    throw new AgentArtifactCandidateError(
      "Candidate artifacts must require user confirmation",
      "CONFIRMATION_REQUIRED",
      400,
    );
  }
  return result.data;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    .join(",")}}`;
}

function artifactsMatch(stored: string, expected: AgentArtifactV1): boolean {
  try {
    return canonicalJson(JSON.parse(stored)) === canonicalJson(expected);
  } catch {
    return false;
  }
}

export function createAgentArtifactCandidateService(
  dependencies: { db?: CandidateDatabase } = {},
): AgentArtifactCandidateService {
  const db = dependencies.db ?? (getPrisma() as unknown as CandidateDatabase);

  return {
    async createCandidate(input) {
      const userId = requiredIdentifier(input.userId, "userId");
      const sourceSessionId = requiredIdentifier(input.context?.sessionId, "context.sessionId");
      const idempotencyKey = requiredIdentifier(
        input.context?.idempotencyKey,
        "context.idempotencyKey",
      );
      if (!allowedCandidateTypes.has(input.candidateType)) {
        throw new AgentArtifactCandidateError(
          "Candidate type is not allowed",
          "CANDIDATE_TYPE_NOT_ALLOWED",
          400,
        );
      }
      const candidateType = input.candidateType as AgentArtifactCandidateType;
      const artifact = validateArtifact(input.artifact);
      if (!COMPATIBLE_TASK_TYPES[candidateType].includes(artifact.taskType)) {
        throw new AgentArtifactCandidateError(
          "Candidate type is incompatible with artifact task type",
          "TASK_TYPE_MISMATCH",
          400,
        );
      }
      if (VERSIONED_CANDIDATE_TYPES.has(candidateType) && artifact.baseVersion === null) {
        throw new AgentArtifactCandidateError(
          "This candidate type requires a base version",
          "BASE_VERSION_REQUIRED",
          400,
        );
      }
      const sourceConversationId = input.context.conversationId?.trim() || null;

      return db.$transaction(async (transaction) => {
        if (sourceConversationId) {
          const conversation = await transaction.chatConversation.findFirst({
            where: { id: sourceConversationId, userId },
            select: { id: true },
          });
          if (!conversation) {
            throw new AgentArtifactCandidateError(
              "Source conversation was not found",
              "CONVERSATION_NOT_FOUND",
              404,
            );
          }
        }

        const stored = await transaction.agentArtifactCandidate.upsert({
          where: {
            userId_sourceSessionId_idempotencyKey: {
              userId,
              sourceSessionId,
              idempotencyKey,
            },
          },
          create: {
            userId,
            sourceSessionId,
            idempotencyKey,
            candidateType,
            status: "pending",
            artifact: JSON.stringify(artifact),
            baseVersion: artifact.baseVersion,
            sourceConversationId,
          },
          update: {},
          select: {
            id: true,
            status: true,
            candidateType: true,
            artifact: true,
            baseVersion: true,
            sourceSessionId: true,
            sourceConversationId: true,
          },
        });

        if (
          stored.candidateType !== candidateType
          || !artifactsMatch(stored.artifact, artifact)
          || stored.sourceSessionId !== sourceSessionId
          || stored.sourceConversationId !== sourceConversationId
        ) {
          throw new AgentArtifactCandidateError(
            "Idempotency key was already used for a different candidate",
            "IDEMPOTENCY_CONFLICT",
            409,
          );
        }

        return {
          id: stored.id,
          status: stored.status,
          candidateType: stored.candidateType,
        };
      });
    },
  };
}
