import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { buildSimulationFeedback } from "@/lib/career";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

const simulationSchema = z.object({
  scenarioKey: z.enum(["cross_role_communication", "ai_office", "remote_collaboration"]),
  scenarioTitle: z.string().min(1),
  userAnswer: z.string().min(5),
});

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const items = await getPrisma().simulationSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok({ items });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  const parsed = simulationSchema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "训练参数不合法", 400, parsed.error.flatten());

  const feedback = buildSimulationFeedback(parsed.data);
  const session = await getPrisma().simulationSession.create({
    data: {
      userId: user.id,
      scenarioKey: parsed.data.scenarioKey,
      scenarioTitle: parsed.data.scenarioTitle,
      transcript: toJson([{ role: "user", content: parsed.data.userAnswer }]),
      score: feedback.score,
      feedback: toJson(feedback),
    },
  });

  const currentScores = JSON.parse(user.profile.abilityScores) as Record<string, number>;
  const field = feedback.profileUpdateCandidate.field;
  const oldValue = field.startsWith("abilityScores.") ? currentScores[field.split(".")[1]] : null;

  const candidate = await getPrisma().profileUpdateCandidate.create({
    data: {
      userId: user.id,
      source: "simulation",
      field,
      oldValue: toJson(oldValue),
      newValue: toJson(feedback.profileUpdateCandidate.newValue),
      confidence: feedback.profileUpdateCandidate.confidence,
      reason: feedback.profileUpdateCandidate.reason,
    },
  });

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "simulation_completed",
      title: `完成模拟训练：${parsed.data.scenarioTitle}`,
      summary: `训练得分 ${feedback.score}，已生成画像更新候选。`,
      metadata: toJson({ simulationId: session.id, candidateId: candidate.id }),
    },
  });

  return ok({ session, feedback, candidateId: candidate.id });
}
