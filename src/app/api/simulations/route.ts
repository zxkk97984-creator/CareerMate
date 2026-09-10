import { attachTrainingConversation } from "@/lib/simulation/chat-session";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import {
  buildCareerInterviewScenario,
  buildRoleSimulationScenarios,
  getSimulationScenario,
  scenarioSnapshotFromMeta,
  simulationDto,
  simulationScenarioSchema,
  simulationScenarioSnapshotSchema,
  type SimulationScenarioMeta,
} from "@/lib/simulation";

const createSchema = z.object({
  requestId: z.string().trim().min(8).max(160).optional(),
  createConversation: z.boolean().optional(),
  scenarioType: simulationScenarioSchema.optional(),
  scenarioSnapshot: simulationScenarioSnapshotSchema.optional(),
  sourceType: z.enum(["recommended", "custom", "job"]).optional(),
  sourceRef: z.string().trim().max(200).nullable().optional(),
  roundLimit: z.number().int().min(3).max(6).optional(),
}).strict().refine(
  (value) => Boolean(value.scenarioType || value.scenarioSnapshot),
  { message: "必须提供 scenarioType 或 scenarioSnapshot" },
);

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const items = await getPrisma().simulationSession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok({ items: items.map(simulationDto) });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "训练场景无效", 400);

  if (parsed.data.requestId) {
    const existing = await getPrisma().simulationSession.findUnique({ where: { userId_creationRequestId: { userId: user.id, creationRequestId: parsed.data.requestId } } });
    if (existing) {
      const conversationId = await getPrisma().$transaction(tx => attachTrainingConversation(tx, existing));
      return ok({ session: simulationDto(existing), conversationId });
    }
  }

  let scenario = parsed.data.scenarioType
    ? getSimulationScenario(parsed.data.scenarioType)
    : null;
  if (!scenario && parsed.data.scenarioSnapshot) {
    scenario = {
      ...parsed.data.scenarioSnapshot,
      key: parsed.data.scenarioSnapshot.key as SimulationScenarioMeta["key"],
    } as SimulationScenarioMeta;
  }
  if (!scenario) return fail("INVALID_INPUT", "训练场景无效", 400);

  if (parsed.data.sourceType === "job" || parsed.data.sourceRef) {
    const sourceRef = parsed.data.sourceRef;
    if (!sourceRef) return fail("INVALID_INPUT", "岗位训练缺少来源岗位", 400);
    const job = await getPrisma().jobSample.findFirst({
      where: { OR: [{ id: sourceRef }, { jobId: sourceRef }] },
      select: { id: true },
    });
    if (!job) return fail("NOT_FOUND", "岗位样本不存在", 404);
  }

  if (!parsed.data.scenarioSnapshot && user.profile.targetRole && parsed.data.scenarioType) {
    const template = await getPrisma().roleTemplate.findUnique({
      where: { roleKey: user.profile.targetRole },
    });
    if (template) {
      const source = {
        roleName: template.roleName,
        coreWork: parseJson<string[]>(template.coreWork, []),
        practiceProjects: parseJson<string[]>(template.practiceProjects, []),
        simulationScenarios: parseJson<string[]>(template.simulationScenarios, []),
      };
      const roleScenarios = buildRoleSimulationScenarios(user.profile, source);
      scenario = roleScenarios.find((item) => item.key === parsed.data.scenarioType) ?? scenario;
    } else if (parsed.data.scenarioType === "career_interview") {
      scenario = buildCareerInterviewScenario(user.profile);
    }
  } else if (parsed.data.scenarioType === "career_interview") {
    scenario = buildCareerInterviewScenario(user.profile);
  }

  const snapshot = parsed.data.scenarioSnapshot ?? scenarioSnapshotFromMeta(scenario);
  const roundLimit = parsed.data.roundLimit ?? 6;
  const sourceType = parsed.data.sourceType
    ?? (snapshot.key === "custom" ? "custom" : parsed.data.sourceRef ? "job" : "recommended");
  const mode = getTboxConfig().mode;
  try {
  const result = await getPrisma().$transaction(async tx => {
  const session = await tx.simulationSession.create({
    data: {
      userId: user.id,
      creationRequestId: parsed.data.requestId,
      scenarioKey: scenario.key,
      scenarioTitle: scenario.title,
      transcript: JSON.stringify([{ role: "assistant", content: snapshot.openingMessage }]),
      status: "active",
      turnCount: 0,
      requestedMode: mode,
      actualMode: mode,
      scenarioSnapshot: JSON.stringify(snapshot),
      scoringSnapshot: JSON.stringify({
        dimensions: snapshot.scoringDimensions,
        roundLimit,
        sourceType,
      }),
      sourceType,
      sourceRef: parsed.data.sourceRef ?? null,
      roundLimit,
    },
  });
  const conversationId = parsed.data.createConversation ? await attachTrainingConversation(tx, session) : null;
  return { session: simulationDto(session), openingMessage: snapshot.openingMessage, conversationId };
  });
  return ok(result);
  } catch (error) {
    if (parsed.data.requestId) {
      const existing = await getPrisma().simulationSession.findUnique({ where: { userId_creationRequestId: { userId: user.id, creationRequestId: parsed.data.requestId } } });
      if (existing) return ok({ session: simulationDto(existing), conversationId: existing.conversationId });
    }
    throw error;
  }
}
