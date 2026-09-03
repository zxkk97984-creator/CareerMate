import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { explorationReportSchema } from "@/lib/careers/exploration-schema";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态已过期", 401);
  const { id } = await params;
  const stored = await getPrisma().careerExplorationReport.findFirst({
    where: { id, userId: user.id },
  });
  if (!stored) return fail("NOT_FOUND", "职业探索报告不存在", 404);
  const parsed = explorationReportSchema.safeParse(parseJson(stored.content, null));
  if (!parsed.success) return fail("INVALID_REPORT", "职业探索报告内容损坏", 422);
  const labels = new Set(parsed.data.sources.map((source) => source.label));
  const sourceLabel = labels.has("实时联网调研")
    ? "实时联网调研"
    : labels.has("已核验职业库")
      ? "精品职业资料"
      : "AI分析与推断";
  return ok({
    report: {
      id: stored.id,
      status: stored.status,
      ...parsed.data,
    },
    sourceLabel,
    executionMeta: parseJson(stored.executionMeta, {}),
  });
}
