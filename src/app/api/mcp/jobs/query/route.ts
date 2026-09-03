import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { isPluginAuthorized } from "@/lib/plugin-auth";

const schema = z.object({
  role: z.string(),
  city: z.string().optional(),
  abilityTags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(10).default(3),
});

export async function POST(request: Request) {
  if (!isPluginAuthorized(request)) return fail("FORBIDDEN", "插件调用令牌无效", 403);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("VALIDATION_ERROR", "岗位查询参数不合法", 400, parsed.error.flatten());

  const city = parsed.data.city ?? "杭州";
  const items = Array.from({ length: parsed.data.limit }, (_, index) => ({
    title: parsed.data.role,
    city,
    companyType: index % 2 === 0 ? "互联网/AI 应用" : "教育/内容科技",
    requirements: parsed.data.abilityTags?.length ? parsed.data.abilityTags : ["AI 工具", "业务理解", "项目产出"],
    description: "脱敏模拟岗位样例，用于能力要求展示，不来自非授权招聘平台爬取。",
    source: "自建脱敏模拟数据",
  }));

  return ok({ items });
}
