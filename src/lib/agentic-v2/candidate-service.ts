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
    create(args: {
      data: {
        userId: string;
        candidateType: AgentArtifactCandidateType;
        status: "pending";
        artifact: string;
        baseVersion: number | null;
        sourceSessionId: string;
        sourceConversationId: string | null;
      };
      select: { id: true; status: true; candidateType: true };
    }): Promise<{ id: string; status: string; candidateType: string }>;
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

export function createAgentArtifactCandidateService(
  dependencies: { db?: CandidateDatabase } = {},
): AgentArtifactCandidateService {
  const db = dependencies.db ?? (getPrisma() as unknown as CandidateDatabase);

  return {
    async createCandidate(input) {
      const userId = requiredIdentifier(input.userId, "userId");
      const sourceSessionId = requiredIdentifier(input.context?.sessionId, "context.sessionId");
      if (!allowedCandidateTypes.has(input.candidateType)) {
        throw new AgentArtifactCandidateError(
          "Candidate type is not allowed",
          "CANDIDATE_TYPE_NOT_ALLOWED",
          400,
        );
      }
      const candidateType = input.candidateType as AgentArtifactCandidateType;
      const artifact = validateArtifact(input.artifact);
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

        return transaction.agentArtifactCandidate.create({
          data: {
            userId,
            candidateType,
            status: "pending",
            artifact: JSON.stringify(artifact),
            baseVersion: artifact.baseVersion,
            sourceSessionId,
            sourceConversationId,
          },
          select: { id: true, status: true, candidateType: true },
        });
      });
    },
  };
}
