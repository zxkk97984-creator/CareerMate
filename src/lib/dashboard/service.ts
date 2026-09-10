import "server-only";
import type { PrismaClient, ProgressLog, UserProfile } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { profileDto } from "@/lib/dto";
import { calculateMatch } from "@/lib/career";
import { normalizePlanTasks } from "@/lib/plans/task-model";
import { buildDashboard, GROWTH_EVENTS, isGrowthEvidence, presentEvidence } from "./model";

/** Scan matching event types in stable batches; the limit applies to evidence, not raw logs. */
export async function loadGrowthEvidence(db: PrismaClient, userId: string) {
  const accepted: ProgressLog[] = [];
  let cursor: { createdAt: Date; id: string } | null = null;
  while (accepted.length < 8) {
    const rows: ProgressLog[] = await db.progressLog.findMany({
      where: {
        userId, eventType: { in: GROWTH_EVENTS },
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
    });
    accepted.push(...rows.filter(isGrowthEvidence).slice(0, 8 - accepted.length));
    if (rows.length < 50) break;
    cursor = rows[rows.length - 1];
  }
  const planIds = [...new Set(accepted.filter((log) => log.eventType === "task_status_updated").map((log) => log.relatedPlanId).filter((id): id is string => Boolean(id)))];
  const plans = planIds.length ? await db.careerPlan.findMany({ where: { userId, id: { in: planIds } } }) : [];
  const names = new Map(plans.map((plan) => [plan.id, new Map(normalizePlanTasks(plan).map((task) => [task.id, task.title]))]));
  return accepted.map((log) => presentEvidence(log, log.relatedPlanId && log.relatedTaskId ? names.get(log.relatedPlanId)?.get(log.relatedTaskId) : undefined));
}

export async function getDashboard(user: { id: string; profile: UserProfile | null }) {
  const db = getPrisma();
  const profile = user.profile ? profileDto(user.profile) : null;
  const [plan, pendingPlan, legacyCount, v2Count, match, evidence] = await Promise.all([
    db.careerPlan.findFirst({ where: { userId: user.id, status: "active" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    db.careerPlan.findFirst({ where: { userId: user.id, status: { in: ["generating", "processing", "pending", "generation_failed"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, status: true } }),
    db.profileUpdateCandidate.count({ where: { userId: user.id, status: "pending" } }),
    db.agentArtifactCandidate.count({ where: { userId: user.id, status: "pending" } }),
    profile ? calculateMatch(profile) : Promise.resolve(null),
    loadGrowthEvidence(db, user.id),
  ]);
  return buildDashboard({ profile, plan: plan ? { id: plan.id, targetRoleLabel: plan.targetRoleLabel, tasks: normalizePlanTasks(plan) } : null, pendingPlan, candidateCount: legacyCount + v2Count, match, evidence });
}
