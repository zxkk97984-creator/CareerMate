import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { resourceDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import type { CareerPlanRow } from "@/lib/plans/compatibility";
import { normalizePlanTasks } from "@/lib/plans/task-model";
import { isAllowedResourceSource } from "@/lib/resources";
import { resourceTypes } from "@/lib/types";

const roleKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9_:-]+$/i);
const querySchema = z.object({
  roleKey: roleKeySchema.optional(),
  abilityKey: z.enum([
    "aiTooling",
    "roleFoundation",
    "dataAnalysis",
    "businessProduct",
    "communication",
    "projectPractice",
  ]).optional(),
  type: z.enum(resourceTypes).optional(),
  q: z.string().trim().max(120).optional(),
  includeUnverified: z.enum(["true", "false"]).optional(),
  taskId: z.string().trim().min(1).max(120).optional(),
  planId: z.string().trim().min(1).max(120).optional(),
}).strict();

const planContextSelect = {
  id: true,
  userId: true,
  targetRole: true,
  status: true,
  schemaVersion: true,
  content: true,
  years: true,
  quarters: true,
  months: true,
  currentMonthIndex: true,
  assumptions: true,
  riskNotes: true,
} as const;

function findTaskTitleInPlan(
  plan: {
    schemaVersion: number;
    content: string;
    years: string;
    quarters: string;
    months: string;
    currentMonthIndex: number;
    assumptions: string;
    riskNotes: string;
  },
  taskId: string,
): string | null {
  const row = {
    ...plan,
    id: "",
    userId: "",
    targetRole: "",
    targetRoleLabel: null,
    version: 1,
    parentPlanId: null,
    activatedAt: null,
    generationMeta: "{}",
  } as CareerPlanRow;
  return normalizePlanTasks(row).find((task) => task.id === taskId)?.title ?? null;
}

async function resolveTaskContext(
  userId: string,
  taskId?: string,
  planId?: string,
): Promise<
  { taskId: string | null; planId: string | null; taskTitle: string | null; roleKey: string | null }
  | { forbidden: true }
> {
  if (!taskId && !planId) return { taskId: null, planId: null, taskTitle: null, roleKey: null };
  const db = getPrisma();
  if (planId) {
    const plan = await db.careerPlan.findUnique({ where: { id: planId }, select: planContextSelect });
    if (!plan || plan.userId !== userId) return { forbidden: true };
    const title = taskId ? findTaskTitleInPlan(plan, taskId) : null;
    if (taskId && !title) return { forbidden: true };
    return { taskId: taskId ?? null, planId, taskTitle: title, roleKey: plan.targetRole };
  }
  const plans = await db.careerPlan.findMany({ where: { userId }, select: planContextSelect });
  for (const plan of plans) {
    const title = findTaskTitleInPlan(plan, taskId!);
    if (title !== null) {
      return { taskId: taskId ?? null, planId: plan.id, taskTitle: title, roleKey: plan.targetRole };
    }
  }
  return { forbidden: true };
}

export async function GET(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const url = new URL(request.url);
  const allowedKeys = ["roleKey", "abilityKey", "type", "q", "includeUnverified", "taskId", "planId"];
  if (allowedKeys.some((key) => url.searchParams.getAll(key).length > 1)) {
    return fail("INVALID_REQUEST", "资源筛选参数不能重复", 400);
  }
  const parsed = querySchema.safeParse({
    roleKey: url.searchParams.get("roleKey") ?? undefined,
    abilityKey: url.searchParams.get("abilityKey") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    includeUnverified: url.searchParams.get("includeUnverified") ?? undefined,
    taskId: url.searchParams.get("taskId") ?? undefined,
    planId: url.searchParams.get("planId") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_REQUEST", "资源筛选参数无效", 400, parsed.error.flatten());

  const where: Record<string, unknown> = {
    status: "active",
    ...(parsed.data.includeUnverified === "true" ? {} : { verificationStatus: "verified" }),
  };
  if (parsed.data.roleKey) where.roleKey = parsed.data.roleKey;
  if (parsed.data.abilityKey) where.abilityKey = parsed.data.abilityKey;
  if (parsed.data.type) where.type = parsed.data.type;
  if (parsed.data.q) {
    where.OR = [
      { title: { contains: parsed.data.q } },
      { description: { contains: parsed.data.q } },
      { provider: { contains: parsed.data.q } },
    ];
  }

  let context: { taskId: string | null; planId: string | null; taskTitle: string | null; roleKey: string | null } = {
    taskId: null,
    planId: null,
    taskTitle: null,
    roleKey: null,
  };
  if (parsed.data.taskId || parsed.data.planId) {
    const resolved = await resolveTaskContext(user.id, parsed.data.taskId, parsed.data.planId);
    if ("forbidden" in resolved) {
      return fail("NOT_FOUND", "无法验证该任务上下文，请从任务详情重新进入", 404);
    }
    context = resolved;
    if (!where.roleKey && context.roleKey) where.roleKey = context.roleKey;
  }

  const items = await getPrisma().resourceItem.findMany({
    where,
    orderBy: [{ roleKey: "asc" }, { stage: "asc" }, { title: "asc" }],
  });

  return ok({
    items: items
      .filter((item) => isAllowedResourceSource(item.source))
      .map(resourceDto),
    context,
  });
}
