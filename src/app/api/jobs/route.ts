import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { jobSampleDto } from "@/lib/dto";
import { getPrisma } from "@/lib/prisma";

const querySchema = z.object({
  city: z.string().trim().max(60).optional(),
  roleKey: z.string().trim().max(80).optional(),
  title: z.string().trim().max(120).optional(),
  experience: z.string().trim().max(60).optional(),
  education: z.string().trim().max(60).optional(),
  salaryUnit: z.enum(["month", "day", "hour", "year"]).optional(),
  comparableOnly: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export async function GET(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    city: url.searchParams.get("city") ?? undefined,
    roleKey: url.searchParams.get("roleKey") ?? undefined,
    title: url.searchParams.get("title") ?? undefined,
    experience: url.searchParams.get("experience") ?? undefined,
    education: url.searchParams.get("education") ?? undefined,
    salaryUnit: url.searchParams.get("salaryUnit") ?? undefined,
    comparableOnly: url.searchParams.get("comparableOnly") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return fail("INVALID_QUERY", "岗位筛选参数无效", 400, parsed.error.flatten());

  const where: Prisma.JobSampleWhereInput = {};
  if (parsed.data.city) where.city = parsed.data.city;
  if (parsed.data.roleKey) where.roleKey = parsed.data.roleKey;
  if (parsed.data.title) where.title = { contains: parsed.data.title };
  if (parsed.data.experience) where.experience = parsed.data.experience;
  if (parsed.data.education) where.education = parsed.data.education;
  if (parsed.data.salaryUnit) where.salaryUnit = parsed.data.salaryUnit;
  if (parsed.data.comparableOnly === "true") where.salaryComparable = true;
  if (parsed.data.q) {
    where.OR = [
      { title: { contains: parsed.data.q } },
      { company: { contains: parsed.data.q } },
      { skills: { contains: parsed.data.q } },
      { jd: { contains: parsed.data.q } },
    ];
  }

  const db = getPrisma();
  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const [total, items, cities, roleKeys, experiences, educations] = await Promise.all([
    db.jobSample.count({ where }),
    db.jobSample.findMany({
      where,
      orderBy: [{ collectedAt: "desc" }, { updatedAt: "desc" }],
      skip,
      take: parsed.data.pageSize,
    }),
    db.jobSample.groupBy({ by: ["city"], _count: { _all: true }, orderBy: { city: "asc" }, take: 30 }),
    db.jobSample.groupBy({ by: ["roleKey"], _count: { _all: true }, orderBy: { roleKey: "asc" }, take: 30 }),
    db.jobSample.groupBy({ by: ["experience"], _count: { _all: true }, orderBy: { experience: "asc" }, take: 30 }),
    db.jobSample.groupBy({ by: ["education"], _count: { _all: true }, orderBy: { education: "asc" }, take: 30 }),
  ]);

  return ok({
    items: items.map(jobSampleDto),
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
    },
    facets: {
      cities: cities.map((item) => ({ value: item.city, count: item._count._all })),
      roleKeys: roleKeys.map((item) => ({ value: item.roleKey, count: item._count._all })),
      experiences: experiences.map((item) => ({ value: item.experience, count: item._count._all })),
      educations: educations.map((item) => ({ value: item.education, count: item._count._all })),
    },
    dataNotice: {
      purpose: "本地分析与演示",
      verificationStatus: "未核验",
      collectedAtApproximate: true,
      salaryComparability: "仅同单位可比；13/14薪、面议和未标单位不进入统一统计",
    },
  });
}
