import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { candidateDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";
import { createCandidateService } from "@/lib/profile/candidate-service";

const patchSchema = z.object({
  candidateId: z.string(),
  action: z.enum(["accept", "edit", "reject"]),
  newValue: z
    .union([z.string(), z.number(), z.array(z.unknown()), z.record(z.unknown())])
    .optional(),
});

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const candidates = await getPrisma().profileUpdateCandidate.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return ok({ items: candidates.map(candidateDto) });
}

export async function PATCH(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success)
    return fail("VALIDATION_ERROR", "候选操作参数不合法", 400, parsed.error.flatten());

  const svc = createCandidateService();

  try {
    const result = await svc.processCandidate(
      parsed.data.candidateId,
      user.id,
      parsed.data.action,
      undefined,
      parsed.data.newValue !== undefined
        ? JSON.stringify(parsed.data.newValue)
        : undefined,
    );
    return ok({ candidate: result });
  } catch (err) {
    if (err instanceof Error && "code" in err && "status" in err) {
      const svcErr = err as { code: string; message: string; status: number };
      return fail(svcErr.code, svcErr.message, svcErr.status);
    }
    throw err;
  }
}
