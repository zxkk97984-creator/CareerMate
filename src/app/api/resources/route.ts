import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
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
  // T16b：由任务进入时携带，服务端按用户核验需要读取的实体（任意 query 参数不可信）
  taskId: z.string().trim().min(1).max(80).optional(),
  planId: z.string().trim().min(1).max(80).optional(),
}).strict();

/** 从计划 content 中解析出月份并定位目标任务，返回其标题；找不到或解析失败返回 null */
function findTaskTitleInPlanContent(contentJson: string | null, taskId: string): string | null {
  if (!contentJson) return null;
  try {
    const parsed = JSON.parse(contentJson);
    const months = Array.isArray(parsed?.months) ? parsed.months : [];
    for (const month of months) {
      const tasks = month?.learningTasks;
      if (!Array.isArray(tasks)) continue;
      const task = tasks.find((t: any) => t?.id === taskId && typeof t?.title === "string");
      if (task) return task.title;
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveTaskContext(userId: string, taskId?: string, planId?: string): Promise<
  { taskId: string | null; planId: string | null; taskTitle: string | null; roleKey: string | null } | { forbidden: true }
> {
  if (!taskId && !planId) return { taskId: null, planId: null, taskTitle: null, roleKey: null };
  const db = getPrisma();
  // 若给了 planId，按 planId 查并校验归属
  if (planId) {
    const plan = await db.careerPlan.findUnique({ where: { id: planId }, select: { id: true, userId: true, targetRole: true, content: true } });
    if (!plan || plan.userId !== userId) return { forbidden: true };
    const title = taskId ? findTaskTitleInPlanContent(plan.content, taskId) : null;
    return { taskId: taskId ?? null, planId, taskTitle: title, roleKey: plan.targetRole };
  }
  // 只给 taskId：需在所有属于该用户的计划里定位到目标任务所在计划
  const plans = await db.careerPlan.findMany({ where: { userId }, select: { id: true, targetRole: true, content: true } });
  for (const plan of plans) {
    const title = findTaskTitleInPlanContent(plan.content, taskId!);
    if (title !== null) return { taskId: taskId ?? null, planId: plan.id, taskTitle: title, roleKey: plan.targetRole };
  }
  // 任务存在但不在任何计划 → 视为无效上下文
  return { forbidden: true };
}

export async function GET(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const url = new URL(request.url);
  if (["roleKey", "abilityKey", "type", "taskId", "planId"].some((key) => url.searchParams.getAll(key).length > 1)) {
    return fail("INVALID_REQUEST", "资源筛选参数不能重复", 400);
  }
  const parsed = querySchema.safeParse({
    roleKey: url.searchParams.get("roleKey") ?? undefined,
    abilityKey: url.searchParams.get("abilityKey") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    taskId: url.searchParams.get("taskId") ?? undefined,
    planId: url.searchParams.get("planId") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_REQUEST", "资源筛选参数无效", 400, parsed.error.flatten());

  const where = { roleKey: parsed.data.roleKey, abilityKey: parsed.data.abilityKey, type: parsed.data.type } as Record<string, string | undefined>;

  // T16b：任务进入时校验上下文归属；taskId/planId 不属当前用户或目标任务不存在 → 403/404
  let context: { taskId: string | null; planId: string | null; taskTitle: string | null; roleKey: string | null } = { taskId: null, planId: null, taskTitle: null, roleKey: null };
  if (parsed.data.taskId || parsed.data.planId) {
    const resolved = await resolveTaskContext(user.id, parsed.data.taskId, parsed.data.planId);
    if ("forbidden" in resolved) return fail("NOT_FOUND", "无法验证该任务上下文，请从任务详情重新进入", 404);
    context = resolved;
    // 上下文能确定角色时，用它作为资源筛选的默认角色（但 user 显式传入的 roleKey 优先）
    if (!where.roleKey && context.roleKey) where.roleKey = context.roleKey;
  }

  const items = await getPrisma().resourceItem.findMany({
    where,
    orderBy: [{ roleKey: "asc" }, { stage: "asc" }],
  });

  return ok({ items: items.filter((item) => isAllowedResourceSource(item.source)), context });
}
