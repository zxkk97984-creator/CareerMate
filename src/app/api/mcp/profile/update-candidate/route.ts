import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requirePluginScope } from "@/lib/plugin-auth";
import { createCareerMateToolRegistry } from "@/lib/tools/careermate-registry";
import { McpError } from "@/lib/tools/registry";

const schema = z.object({
  userId: z.string(),
  source: z.string(),
  field: z.string(),
  newValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  evidenceExcerpt: z.string().optional(),
  impactSummary: z.string().optional(),
  sourceConversationId: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "画像候选参数不合法", 400, parsed.error.flatten());
  const principal = requirePluginScope(request, "profile:candidates", parsed.data.userId);
  if (!principal) return fail("FORBIDDEN", "插件用户绑定或权限不匹配", 403);

  try {
    const result = await createCareerMateToolRegistry().call(
      "profile.candidate.create",
      {
        field: parsed.data.field,
        newValue: parsed.data.newValue,
        confidence: parsed.data.confidence,
        reason: parsed.data.reason,
        evidenceExcerpt: parsed.data.evidenceExcerpt,
        impactSummary: parsed.data.impactSummary,
        sourceConversationId: parsed.data.sourceConversationId,
      },
      {
        userId: principal.userId,
        sessionId: crypto.randomUUID(),
        scopes: principal.scopes,
      },
    ) as { id: string; status: string };
    return ok({
      candidateId: result.id,
      status: result.status,
      requiresConfirmation: true,
    });
  } catch (error) {
    if (error instanceof McpError) {
      const status = error.code === "INVALID_PARAMS" ? 400
        : error.code === "INSUFFICIENT_SCOPE" ? 403
        : error.code === "NOT_FOUND" ? 404
        : 500;
      return fail(error.code, error.message, status);
    }
    throw error;
  }
}
