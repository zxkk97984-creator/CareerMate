import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import {
  buildCareerInterviewScenario,
  buildJobSimulationScenario,
  buildRoleSimulationScenarios,
  customScenarioInputSchema,
  getSimulationScenario,
  listSimulationScenarios,
  rankSimulationScenarios,
  scenarioSnapshotFromMeta,
  simulationScenarioSchema,
} from "@/lib/simulation";
import { sanitizeJobSampleForContext } from "@/lib/jobs/context";
import { z } from "zod";
import { generateSimulationScenario } from "@/lib/simulation/generation";

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  const targetRole = user.profile.targetRole;
  const history = await getPrisma().simulationSession.findMany({
    where: { userId: user.id, status: "completed" },
    orderBy: { updatedAt: "desc" },
    select: { scenarioKey: true, score: true },
    take: 20,
  });
  const abilityScores = parseJson<Record<string, number>>(user.profile.abilityScores, {});
  const recommendationEvidence = { abilityScores, history };
  if (!targetRole) {
    return ok({
      items: rankSimulationScenarios(
        [...listSimulationScenarios(), buildCareerInterviewScenario(user.profile)],
        recommendationEvidence,
      ),
    });
  }

  const template = await getPrisma().roleTemplate.findUnique({
    where: { roleKey: targetRole },
  });

  if (!template) {
    return ok({
      items: rankSimulationScenarios(
        [...listSimulationScenarios(), buildCareerInterviewScenario(user.profile)],
        recommendationEvidence,
      ),
    });
  }

  const source = {
    roleName: template.roleName,
    coreWork: parseJson<string[]>(template.coreWork, []),
    practiceProjects: parseJson<string[]>(template.practiceProjects, []),
    simulationScenarios: parseJson<string[]>(template.simulationScenarios, []),
  };

  return ok({
    items: rankSimulationScenarios(
      buildRoleSimulationScenarios(user.profile, source),
      recommendationEvidence,
    ),
  });
}

const previewSchema = z.object({
  mode: z.enum(["recommended", "custom"]),
  scenarioType: simulationScenarioSchema.optional(),
  sourceRef: z.string().trim().max(200).nullable().optional(),
  jobId: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  role: z.string().trim().max(160).optional(),
  counterpart: z.string().trim().max(160).optional(),
  objective: z.string().trim().max(500).optional(),
  difficulty: z.enum(["L1", "L2", "L3"]).optional(),
}).strict();

/**
 * 场景预览：推荐场景按目标岗位解析，自定义场景按用户输入生成；
 * 这里不写数据库，用户确认“开始”后再把快照交给 POST /api/simulations。
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "场景预览参数无效", 400, parsed.error.flatten());

  if (parsed.data.mode === "custom") {
    const custom = customScenarioInputSchema.safeParse({
      description: parsed.data.description,
      role: parsed.data.role,
      counterpart: parsed.data.counterpart,
      objective: parsed.data.objective,
      difficulty: parsed.data.difficulty,
    });
    if (!custom.success) return fail("INVALID_INPUT", "自定义场景信息不完整", 400, custom.error.flatten());
    const generated = await generateSimulationScenario({
      userId: user.id,
      request: parsed.data.description ?? "",
      custom: custom.data,
    });
    return ok({
      sourceType: generated.data.sourceType,
      sourceRef: generated.data.sourceRef,
      scenarioSnapshot: generated.data.scenarioSnapshot,
    }, generated.meta as unknown as Record<string, unknown>);
  }
  if (parsed.data.jobId) {
    const job = await getPrisma().jobSample.findFirst({
      where: { OR: [{ id: parsed.data.jobId }, { jobId: parsed.data.jobId }] },
    });
    if (!job) return fail("NOT_FOUND", "岗位样本不存在", 404);
    const jobContext = sanitizeJobSampleForContext(job);
    return ok({
      sourceType: "job",
      sourceRef: job.jobId,
      scenarioSnapshot: buildJobSimulationScenario(jobContext),
    });
  }

  if (!parsed.data.scenarioType) return fail("INVALID_INPUT", "推荐场景缺少 scenarioType", 400);

  let scenario = getSimulationScenario(parsed.data.scenarioType);
  if (user.profile.targetRole) {
    const template = await getPrisma().roleTemplate.findUnique({
      where: { roleKey: user.profile.targetRole },
    });
    if (template) {
      scenario = buildRoleSimulationScenarios(user.profile, {
        roleName: template.roleName,
        coreWork: parseJson<string[]>(template.coreWork, []),
        practiceProjects: parseJson<string[]>(template.practiceProjects, []),
        simulationScenarios: parseJson<string[]>(template.simulationScenarios, []),
      }).find((item) => item.key === parsed.data.scenarioType) ?? scenario;
    } else if (parsed.data.scenarioType === "career_interview") {
      scenario = buildCareerInterviewScenario(user.profile);
    }
  }

  return ok({
    sourceType: parsed.data.sourceRef ? "job" : "recommended",
    sourceRef: parsed.data.sourceRef ?? null,
    scenarioSnapshot: scenarioSnapshotFromMeta(scenario),
  });
}
