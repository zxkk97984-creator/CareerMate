import type { AgentArtifactV1 } from "@/lib/agentic-v2/contracts";
import type { AgentArtifactCandidateService } from "@/lib/agentic-v2/candidate-service";
import { formatTaskResourceReference, isAllowedResourceSource } from "@/lib/resources";
import {
  readPlanV2,
  type CareerPlanRow,
} from "./compatibility";
import type { AiCareerPlanV2, PlanActionV2 } from "./schema-v2";

export class ResourceAssociationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ResourceAssociationError";
  }
}

export interface AssociableResource {
  id: string;
  title: string;
  source: string;
  provider: string | null;
  url: string | null;
  verificationStatus: string;
}

interface ResourceAssociationDatabase {
  careerPlan: {
    findFirst(args: {
      where: { id: string; userId: string };
    }): Promise<CareerPlanRow | null>;
  };
  resourceItem: {
    findFirst(args: {
      where: { id: string; status: string };
    }): Promise<AssociableResource | null>;
  };
}

export type ResourceAssociationResult =
  | {
      kind: "pending";
      candidateId: string;
      planId: string;
      taskId: string;
      resourceId: string;
    }
  | {
      kind: "unchanged";
      candidateId: null;
      planId: string;
      taskId: string;
      resourceId: string;
    };

function updateActionResources(
  plan: AiCareerPlanV2,
  taskId: string,
  reference: string,
): { plan: AiCareerPlanV2; action: PlanActionV2 } | null {
  let matched: PlanActionV2 | null = null;
  const update = (action: PlanActionV2) => {
    if (action.id !== taskId) return action;
    matched = action;
    return { ...action, resources: [...action.resources, reference] };
  };
  const phases = plan.phases.map((phase) => ({
    ...phase,
    actions: phase.actions.map(update),
  }));
  const immediateActions = plan.immediateActions.map(update);
  return matched ? { plan: { ...plan, phases, immediateActions }, action: matched } : null;
}

export async function createTaskResourceAssociation(
  input: {
    userId: string;
    planId: string;
    taskId: string;
    resourceId: string;
  },
  dependencies: {
    db: ResourceAssociationDatabase;
    candidateService: AgentArtifactCandidateService;
  },
): Promise<ResourceAssociationResult> {
  const [planRow, resource] = await Promise.all([
    dependencies.db.careerPlan.findFirst({
      where: { id: input.planId, userId: input.userId },
    }),
    dependencies.db.resourceItem.findFirst({
      where: { id: input.resourceId, status: "active" },
    }),
  ]);
  if (!planRow) {
    throw new ResourceAssociationError("未找到职业路径", "PLAN_NOT_FOUND", 404);
  }
  if (planRow.status !== "active") {
    throw new ResourceAssociationError("归档计划不能修改", "PLAN_ARCHIVED", 409);
  }
  if (!resource) {
    throw new ResourceAssociationError("未找到可用学习资源", "RESOURCE_NOT_FOUND", 404);
  }
  if (!isAllowedResourceSource(resource.source)) {
    throw new ResourceAssociationError("该资源来源不允许关联", "RESOURCE_SOURCE_NOT_ALLOWED", 403);
  }

  const plan = readPlanV2(planRow);
  if (!plan) {
    throw new ResourceAssociationError(
      "当前计划不是可安全关联资源的 Plan V2",
      "PLAN_V2_REQUIRED",
      409,
    );
  }
  const reference = formatTaskResourceReference(resource);
  const action = [...plan.phases.flatMap((phase) => phase.actions), ...plan.immediateActions]
    .find((item) => item.id === input.taskId);
  if (!action) {
    throw new ResourceAssociationError("未找到职业路径任务", "TASK_NOT_FOUND", 404);
  }
  if (action.resources.includes(reference)) {
    return {
      kind: "unchanged",
      candidateId: null,
      planId: planRow.id,
      taskId: action.id,
      resourceId: resource.id,
    };
  }

  const updated = updateActionResources(plan, action.id, reference);
  if (!updated) {
    throw new ResourceAssociationError("未找到职业路径任务", "TASK_NOT_FOUND", 404);
  }

  const artifact: AgentArtifactV1 = {
    schemaVersion: "1.0",
    taskType: "career_plan",
    status: "pending_confirmation",
    summary: `将资源「${resource.title}」关联到任务「${updated.action.title}」`,
    data: { plan: updated.plan },
    evidence: [{
      type: "learning_resource",
      resourceId: resource.id,
      title: resource.title,
      source: resource.source,
      url: resource.url,
    }],
    sources: resource.url ? [{
      id: resource.id,
      title: resource.title,
      url: resource.url,
      publisher: resource.provider ?? resource.source,
      publishedAt: null,
      accessedAt: null,
    }] : [],
    assumptions: [],
    warnings: resource.verificationStatus === "verified"
      ? []
      : ["资源来源尚未核验，确认前请自行检查可用性"],
    requiresUserConfirmation: true,
    baseVersion: planRow.version,
    nextActions: ["确认后将资源加入任务的关联材料"],
  };

  const candidate = await dependencies.candidateService.createCandidate({
    userId: input.userId,
    candidateType: "career_plan",
    artifact,
    context: {
      sessionId: "resource-center",
      conversationId: null,
      idempotencyKey: `${planRow.id}:${action.id}:${resource.id}`,
    },
  });
  return {
    kind: "pending",
    candidateId: candidate.id,
    planId: planRow.id,
    taskId: action.id,
    resourceId: resource.id,
  };
}
