import { z } from "zod";
import { parseJson } from "@/lib/json";

export const jobSampleContextSchema = z.object({
  source: z.literal("local_boss_sample"),
  sourceBatch: z.string().trim().min(1).max(120),
  jobId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable(),
  city: z.string().trim().min(1).max(120),
  experience: z.string().trim().max(120).nullable(),
  education: z.string().trim().max(120).nullable(),
  salary: z.object({
    raw: z.string().max(200),
    min: z.number().nullable(),
    max: z.number().nullable(),
    unit: z.enum(["month", "day", "hour", "year"]).nullable(),
    months: z.number().int().nullable(),
    comparable: z.boolean(),
    note: z.string().max(500),
  }).strict(),
  skills: z.array(z.string().trim().min(1).max(120)).max(50),
  jd: z.string().max(20_000),
  collectedAt: z.string().datetime({ offset: true }).nullable(),
  collectionDateApprox: z.boolean(),
  verificationStatus: z.literal("unverified"),
}).strict();

export type JobSampleContext = z.infer<typeof jobSampleContextSchema>;

export interface JobSampleContextSource {
  jobId: string;
  title: string;
  company: string | null;
  city: string;
  experience: string | null;
  education: string | null;
  salaryRaw: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryUnit: string | null;
  salaryMonths: number | null;
  salaryComparable: boolean;
  salaryNote: string;
  skills: string;
  jd: string;
  sourceBatch: string;
  collectedAt: Date | null;
  collectionDateApprox: boolean;
  verificationStatus: string;
}

const salaryUnits = new Set(["month", "day", "hour", "year"]);

/**
 * 岗位自由文本统一脱敏。保留业务信息，只替换明确的联系方式与证件号。
 */
export function sanitizeFreeText(value: string, maxLength = 20_000): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[已脱敏邮箱]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[已脱敏电话]")
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[已脱敏证件号]")
    .replace(/(?:微信|WeChat|wx)\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,19}/gi, "[已脱敏微信]")
    .slice(0, maxLength);
}

/**
 * 只把岗位样本的必要字段交给模型。
 * 不包含招聘者姓名、活跃状态、联系方式、原始 CSV 全包或来源文件清单。
 */
export function sanitizeJobSampleForContext(row: JobSampleContextSource): JobSampleContext {
  const salaryUnit = row.salaryUnit && salaryUnits.has(row.salaryUnit)
    ? row.salaryUnit as JobSampleContext["salary"]["unit"]
    : null;
  return jobSampleContextSchema.parse({
    source: "local_boss_sample",
    sourceBatch: row.sourceBatch,
    jobId: row.jobId,
    title: row.title,
    company: row.company,
    city: row.city,
    experience: row.experience,
    education: row.education,
    salary: {
      raw: row.salaryRaw.slice(0, 200),
      min: row.salaryMin,
      max: row.salaryMax,
      unit: salaryUnit,
      months: row.salaryMonths,
      comparable: row.salaryComparable,
      note: row.salaryNote.slice(0, 500),
    },
    skills: parseJson<string[]>(row.skills, [])
      .filter((item) => typeof item === "string" && item.trim())
      .slice(0, 50),
    jd: sanitizeFreeText(row.jd),
    collectedAt: row.collectedAt?.toISOString() ?? null,
    collectionDateApprox: row.collectionDateApprox,
    verificationStatus: "unverified",
  });
}
