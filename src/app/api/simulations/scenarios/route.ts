import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import {
  buildCareerInterviewScenario,
  buildRoleSimulationScenarios,
  listSimulationScenarios,
} from "@/lib/simulation";

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user?.profile) return fail("UNAUTHORIZED", "未登录或缺少画像", 401);

  const targetRole = user.profile.targetRole;
  if (!targetRole) {
    return ok({ items: [...listSimulationScenarios(), buildCareerInterviewScenario(user.profile)] });
  }

  const template = await getPrisma().roleTemplate.findUnique({
    where: { roleKey: targetRole },
  });

  if (!template) {
    return ok({ items: [...listSimulationScenarios(), buildCareerInterviewScenario(user.profile)] });
  }

  const source = {
    roleName: template.roleName,
    coreWork: parseJson<string[]>(template.coreWork, []),
    practiceProjects: parseJson<string[]>(template.practiceProjects, []),
    simulationScenarios: parseJson<string[]>(template.simulationScenarios, []),
  };

  return ok({
    items: buildRoleSimulationScenarios(user.profile, source),
  });
}
