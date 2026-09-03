import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { parseJson } from "@/lib/json";
import { buildCareerInterviewScenario, buildRoleSimulationScenarios, getSimulationScenario, listSimulationScenarios, simulationDto, simulationScenarioSchema } from "@/lib/simulation";

const createSchema = z.object({ scenarioType: simulationScenarioSchema }).strict();

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  const items = await getPrisma().simulationSession.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return ok({ items: items.map(simulationDto) });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "训练场景无效", 400);
  let scenario = getSimulationScenario(parsed.data.scenarioType);
  if (user.profile.targetRole) {
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
  const mode = getTboxConfig().mode;
  const session = await getPrisma().simulationSession.create({
    data: {
      userId: user.id,
      scenarioKey: scenario.key,
      scenarioTitle: scenario.title,
      transcript: JSON.stringify([{ role: "assistant", content: scenario.openingMessage }]),
      status: "active",
      turnCount: 0,
      requestedMode: mode,
      actualMode: mode,
    },
  });
  return ok({ session: simulationDto(session), openingMessage: scenario.openingMessage });
}
