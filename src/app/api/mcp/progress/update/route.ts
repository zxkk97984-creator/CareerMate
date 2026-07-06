import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { toJson } from "@/lib/json";
import { isPluginAuthorized } from "@/lib/plugin-auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string(),
  eventType: z.string(),
  title: z.string(),
  relatedPlanId: z.string().optional(),
  relatedTaskId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  if (!isPluginAuthorized(request)) return fail("FORBIDDEN", "插件调用令牌无效", 403);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "进度更新参数不合法", 400, parsed.error.flatten());

  const log = await getPrisma().progressLog.create({
    data: {
      userId: parsed.data.userId,
      eventType: parsed.data.eventType,
      title: parsed.data.title,
      relatedPlanId: parsed.data.relatedPlanId,
      relatedTaskId: parsed.data.relatedTaskId,
      metadata: toJson(parsed.data.metadata ?? {}),
    },
  });

  return ok({ progressLogId: log.id });
}
