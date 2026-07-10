import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { planDto } from "@/lib/dto";
import { updatePlanTaskStatus } from "@/lib/path";
import { getPrisma } from "@/lib/prisma";
import { taskStatuses } from "@/lib/types";

const paramsSchema = z.object({
  planId: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
});
const bodySchema = z.object({ status: z.enum(taskStatuses) }).strict();

class TaskPlanConflictError extends Error {}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ planId: string; taskId: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) return fail("INVALID_REQUEST", "计划或任务标识无效", 400);
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "请求体必须是有效 JSON", 400);
  }
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) return fail("INVALID_REQUEST", "任务状态无效", 400, parsedBody.error.flatten());

  const { planId, taskId } = parsedParams.data;
  const plan = await getPrisma().careerPlan.findFirst({ where: { id: planId, userId: user.id } });
  if (!plan) return fail("NOT_FOUND", "未找到职业路径或任务", 404);
  if (plan.status !== "active") return fail("PLAN_ARCHIVED", "归档计划不能修改", 409);

  const update = updatePlanTaskStatus(plan.months, taskId, parsedBody.data.status);
  if (update.kind === "invalid") return fail("INVALID_PLAN_DATA", "职业路径任务结构无效", 400);
  if (update.kind === "missing") return fail("NOT_FOUND", "未找到职业路径或任务", 404);
  if (update.kind === "unchanged") return ok({ plan: planDto(plan), changed: false });

  try {
    const updatedPlan = await getPrisma().$transaction(async (transaction) => {
      const winner = await transaction.careerPlan.updateMany({
        where: {
          id: plan.id,
          userId: user.id,
          status: "active",
          updatedAt: plan.updatedAt,
        },
        data: { months: JSON.stringify(update.months) },
      });
      if (winner.count !== 1) throw new TaskPlanConflictError("plan changed");

      await transaction.progressLog.create({
        data: {
          userId: user.id,
          eventType: "task_status_updated",
          title: "更新本月任务状态",
          summary: `${update.previousStatus} → ${parsedBody.data.status}`,
          relatedPlanId: plan.id,
          relatedTaskId: taskId,
          metadata: JSON.stringify({ previousStatus: update.previousStatus, status: parsedBody.data.status }),
        },
      });
      const persisted = await transaction.careerPlan.findUnique({ where: { id: plan.id } });
      if (!persisted) throw new TaskPlanConflictError("plan disappeared");
      return persisted;
    });

    return ok({ plan: planDto(updatedPlan), changed: true });
  } catch (error) {
    const databaseCode = error && typeof error === "object" && "code" in error ? String(error.code) : null;
    if (error instanceof TaskPlanConflictError || databaseCode === "P1008" || databaseCode === "P2034") {
      return fail("PLAN_CONFLICT", "职业路径已更新或归档，请刷新后重试", 409);
    }
    return fail("TASK_UPDATE_FAILED", "任务状态保存失败，请稍后重试", 500);
  }
}
