import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { toJson } from "@/lib/json";
import { requirePluginScope } from "@/lib/plugin-auth";
import { getPrisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string(),
  source: z.string(),
  field: z.string(),
  newValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "画像候选参数不合法", 400, parsed.error.flatten());
  const principal = requirePluginScope(request, "profile:candidates", parsed.data.userId);
  if (!principal) return fail("FORBIDDEN", "插件用户绑定或权限不匹配", 403);

  const candidate = await getPrisma().profileUpdateCandidate.create({
    data: {
      userId: principal.userId,
      source: parsed.data.source,
      field: parsed.data.field,
      newValue: toJson(parsed.data.newValue),
      confidence: parsed.data.confidence,
      reason: parsed.data.reason,
    },
  });

  return ok({ candidateId: candidate.id, status: candidate.status, requiresConfirmation: candidate.requiresConfirmation });
}
