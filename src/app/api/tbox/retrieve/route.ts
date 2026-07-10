import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import {
  retrievalInputSchema,
  retrieveWithTbox,
  type RetrievalInput,
} from "@/lib/tbox/retrieval";
import type { RetrievalItem } from "@/lib/tbox/types";
import { getMockRetrievalItems } from "@/lib/tbox/fixtures";

async function localRetrieval(input: RetrievalInput): Promise<RetrievalItem[]> {
  if (input.datasetKey === "ethicsRules") {
    return getMockRetrievalItems("ethicsRules", input.limit);
  }
  const prisma = getPrisma();
  if (input.datasetKey === "learningResources") {
    const items = await prisma.resourceItem.findMany({
      where: {
        OR: [
          { title: { contains: input.query } },
          { description: { contains: input.query } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: input.limit,
    });
    return items.map((item) => ({
      content: `${item.title}：${item.description}`,
      source: item.source || "local-resource-item",
      score: 1,
    }));
  }

  const roles = await prisma.roleTemplate.findMany({
    orderBy: { roleKey: "asc" },
    take: input.limit,
  });
  return roles.flatMap((role) => {
    const values =
      input.datasetKey === "roleCompetency"
        ? [
            ...parseJson<string[]>(role.entryRequirements, []),
            ...parseJson<string[]>(role.coreWork, []),
          ]
        : parseJson<string[]>(role.simulationScenarios, []);
    if (!values.length) return [];
    return [
      {
        content: `${role.roleName}：${values.join("；")}`,
        source: `local-role-template:${role.roleKey}`,
        score: 1,
      },
    ];
  });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsed = retrievalInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "检索参数不合法", 400);
  const result = await retrieveWithTbox(parsed.data, {
    config: getTboxConfig(),
    local: localRetrieval,
  });
  return ok(result.data, result.meta as unknown as Record<string, unknown>);
}
