import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { candidateDto } from "@/lib/dto";
import { parseJson, toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import type { AbilityScores } from "@/lib/types";

const patchSchema = z.object({
  candidateId: z.string(),
  action: z.enum(["accept", "reject"]),
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
  if (!parsed.success) return fail("VALIDATION_ERROR", "候选操作参数不合法", 400, parsed.error.flatten());

  const candidate = await getPrisma().profileUpdateCandidate.findFirst({
    where: { id: parsed.data.candidateId, userId: user.id },
  });
  if (!candidate) return fail("NOT_FOUND", "画像更新候选不存在", 404);

  if (parsed.data.action === "accept") {
    if (candidate.field.startsWith("abilityScores.")) {
      const abilityKey = candidate.field.split(".")[1];
      const scores = parseJson<AbilityScores>(user.profile.abilityScores, {
        aiTooling: 0,
        roleFoundation: 0,
        dataAnalysis: 0,
        businessProduct: 0,
        communication: 0,
        projectPractice: 0,
      });
      scores[abilityKey as keyof AbilityScores] = Number(parseJson(candidate.newValue, scores[abilityKey as keyof AbilityScores]));
      await getPrisma().userProfile.update({
        where: { userId: user.id },
        data: { abilityScores: toJson(scores) },
      });
    }
  }

  const updated = await getPrisma().profileUpdateCandidate.update({
    where: { id: candidate.id },
    data: { status: parsed.data.action === "accept" ? "accepted" : "rejected" },
  });

  return ok({ candidate: candidateDto(updated) });
}
