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

  const roles = await prisma.roleTemplate.findMany({ orderBy: { roleKey: "asc" } });
  const queryTokens = input.query
    .toLocaleLowerCase()
    .split(/[\s,，。；;、/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const normalizedQuery = input.query.toLocaleLowerCase().replace(/\s+/g, "");
  return roles
    .map((role) => {
    const values =
      input.datasetKey === "roleCompetency"
        ? [
            ...parseJson<string[]>(role.entryRequirements, []),
            ...parseJson<string[]>(role.coreWork, []),
          ]
        : parseJson<string[]>(role.simulationScenarios, []);
    const fields = [role.roleKey.replaceAll("_", " "), role.roleName, role.category, ...values]
      .map((value) => value.toLocaleLowerCase());
    const searchable = fields
      .join(" ")
      .toLocaleLowerCase();
    const tokenScore = queryTokens.reduce(
      (total, token) => total + (searchable.includes(token) ? 1 : 0),
      0,
    );
    const phraseScore = fields.reduce((total, field) => {
      const compact = field.replace(/\s+/g, "");
      if (compact.length < 2) return total;
      return total + (normalizedQuery.includes(compact) || compact.includes(normalizedQuery) ? 2 : 0);
    }, 0);
    const score = tokenScore + phraseScore;
    if (!values.length || score === 0) return null;
    return {
        content: `${role.roleName}：${values.join("；")}`,
        source: `local-role-template:${role.roleKey}`,
        score: score / queryTokens.length,
      };
    })
    .filter((item): item is RetrievalItem => item !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit);
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
