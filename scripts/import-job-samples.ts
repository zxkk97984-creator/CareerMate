import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getPrisma } from "@/lib/prisma";
import { parseSalary } from "@/lib/jobs/salary";
import { readCsvFile } from "./lib/csv";

const DEFAULT_INPUT = "date/output";
const ROLE_RULES: Array<{ pattern: RegExp; roleKey: string }> = [
  { pattern: /前端|web/i, roleKey: "frontend_developer" },
  { pattern: /算法|机器学习|人工智能|\bai\b/i, roleKey: "ai_engineer" },
  { pattern: /大数据|数据开发|数据仓库|数仓/i, roleKey: "data_engineer" },
  { pattern: /数据分析|\bbi\b/i, roleKey: "data_analyst" },
  { pattern: /测试/i, roleKey: "qa_engineer" },
  { pattern: /运维|devops|sre/i, roleKey: "devops_engineer" },
  { pattern: /产品/i, roleKey: "product_manager" },
  { pattern: /ui|设计/i, roleKey: "ui_designer" },
  { pattern: /java|python|后端|golang|c\+\+|软件开发/i, roleKey: "backend_developer" },
];

interface MergeField {
  values: Map<string, Set<string>>;
}

interface JobAccumulator {
  jobId: string;
  title: string;
  company: string | null;
  city: string;
  experience: string | null;
  education: string | null;
  salaryRaw: string;
  skills: Set<string>;
  jobLink: string | null;
  jd: string;
  sourceFiles: Set<string>;
  detailAvailable: boolean;
  fields: Map<string, MergeField>;
}

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[|，,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cityFromLocation(location: string | undefined): string {
  const first = (location ?? "").split(/[·\-\s]/).map((item) => item.trim()).find(Boolean);
  return first || "未知";
}

function parseTags(tags: string | undefined): { experience: string | null; education: string | null } {
  let experience: string | null = null;
  let education: string | null = null;
  for (const tag of splitList(tags)) {
    if (!experience && /经验|应届|年|实习/.test(tag)) experience = tag;
    if (!education && /本科|大专|硕士|博士|中专|学历|高中/.test(tag)) education = tag;
  }
  return { experience, education };
}

function roleKeyFor(title: string): string | null {
  return ROLE_RULES.find((rule) => rule.pattern.test(title))?.roleKey ?? null;
}

function addField(accumulator: JobAccumulator, field: string, value: string | undefined, sourceFile: string) {
  const normalized = (value ?? "").trim();
  if (!normalized) return;
  const existing = accumulator.fields.get(field) ?? { values: new Map<string, Set<string>>() };
  const sources = existing.values.get(normalized) ?? new Set<string>();
  sources.add(sourceFile);
  existing.values.set(normalized, sources);
  accumulator.fields.set(field, existing);
}

function mergeRecord(accumulator: JobAccumulator, record: Record<string, string>, sourceFile: string, detail: boolean) {
  const title = record.title?.trim();
  if (title) {
    if (!accumulator.title || accumulator.title === "未命名岗位") accumulator.title = title;
    addField(accumulator, "title", title, sourceFile);
  }
  if (record.company?.trim() && !accumulator.company) accumulator.company = record.company.trim();
  addField(accumulator, "salary", record.salary, sourceFile);
  addField(accumulator, "location", record.location, sourceFile);
  addField(accumulator, "jobLink", record.job_link, sourceFile);

  const tags = detail ? record.tags_list : record.tags;
  const parsedTags = parseTags(tags);
  if (parsedTags.experience && !accumulator.experience) accumulator.experience = parsedTags.experience;
  if (parsedTags.education && !accumulator.education) accumulator.education = parsedTags.education;

  const salary = record.salary?.trim();
  if (salary && (!accumulator.salaryRaw || detail)) accumulator.salaryRaw = salary;
  const city = cityFromLocation(record.location);
  if (city !== "未知") accumulator.city = city;

  const skills = detail ? record.skill_tags : record.skills;
  for (const skill of splitList(skills)) accumulator.skills.add(skill);

  if (record.job_link?.trim() && !accumulator.jobLink) accumulator.jobLink = record.job_link.trim();
  if (detail && record.jd?.trim()) {
    accumulator.jd = record.jd.trim();
    accumulator.detailAvailable = true;
  }
  accumulator.sourceFiles.add(sourceFile);
}

function conflicts(accumulator: JobAccumulator): Array<{ field: string; values: Array<{ value: string; sourceFiles: string[] }> }> {
  return [...accumulator.fields.entries()]
    .filter(([, field]) => field.values.size > 1)
    .map(([field, value]) => ({
      field,
      values: [...value.values.entries()].map(([item, sources]) => ({
        value: item,
        sourceFiles: [...sources].sort(),
      })),
    }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", default: DEFAULT_INPUT },
      batch: { type: "string", default: `jobs-${new Date().toISOString().slice(0, 10)}` },
      "collected-at": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const input = values.input ?? DEFAULT_INPUT;
  const batch = values.batch ?? "jobs-manual";
  const dryRun = Boolean(values["dry-run"]);
  const collectedAt = values["collected-at"] ? new Date(values["collected-at"]) : null;
  if (collectedAt && Number.isNaN(collectedAt.getTime())) {
    console.error("[jobs] --collected-at 不是有效日期");
    process.exit(1);
  }

  const jobs = new Map<string, JobAccumulator>();
  const files = filesIn(input);
  let listFiles = 0;
  let detailFiles = 0;
  let rows = 0;

  for (const file of files) {
    const { headers, records } = readCsvFile(file);
    const detail = headers.includes("jd");
    if (detail) detailFiles += 1;
    else listFiles += 1;
    for (const record of records) {
      const jobId = record.job_id?.trim();
      if (!jobId) continue;
      rows += 1;
      const accumulator = jobs.get(jobId) ?? {
        jobId,
        title: "未命名岗位",
        company: null,
        city: "未知",
        experience: null,
        education: null,
        salaryRaw: "",
        skills: new Set<string>(),
        jobLink: null,
        jd: "",
        sourceFiles: new Set<string>(),
        detailAvailable: false,
        fields: new Map<string, MergeField>(),
      };
      mergeRecord(accumulator, record, file, detail);
      jobs.set(jobId, accumulator);
    }
  }

  const errors: string[] = [];
  const prisma = getPrisma();
  let created = 0;
  let updated = 0;
  const payloads: Array<{ jobId: string; data: Record<string, unknown> }> = [];

  for (const job of jobs.values()) {
    if (!job.title.trim()) errors.push(`${job.jobId}: 缺少标题`);
    if (!job.salaryRaw.trim()) errors.push(`${job.jobId}: 缺少薪资`);
    const salary = parseSalary(job.salaryRaw);
    const payload = {
      jobId: job.jobId,
      roleKey: roleKeyFor(job.title),
      title: job.title,
      company: job.company,
      city: job.city,
      experience: job.experience,
      education: job.education,
      salaryRaw: job.salaryRaw,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryUnit: salary.unit,
      salaryMonths: salary.months,
      salaryComparable: salary.comparable,
      salaryNote: salary.note,
      skills: JSON.stringify([...job.skills]),
      jobLink: job.jobLink,
      jd: job.jd,
      sourceFile: JSON.stringify([...job.sourceFiles].sort()),
      sourceBatch: batch,
      collectedAt,
      collectionDateApprox: Boolean(collectedAt),
      verificationStatus: "unverified",
      detailAvailable: job.detailAvailable,
      fieldConflicts: JSON.stringify(conflicts(job)),
    };

    payloads.push({ jobId: job.jobId, data: payload });
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`[jobs] ${error}`);
    console.error(`[jobs] 校验失败，共 ${errors.length} 条；未写入数据库`);
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    for (const payload of payloads) {
      const existing = await prisma.jobSample.findUnique({ where: { jobId: payload.jobId } });
      if (existing) {
        await prisma.jobSample.update({ where: { jobId: payload.jobId }, data: payload.data });
        updated += 1;
      } else {
        await prisma.jobSample.create({ data: payload.data as never });
        created += 1;
      }
    }
  }

  console.log(JSON.stringify({
    input,
    batch,
    dryRun,
    files: files.length,
    listFiles,
    detailFiles,
    rows,
    mergedJobs: jobs.size,
    withDetails: [...jobs.values()].filter((job) => job.detailAvailable).length,
    created,
    updated,
    collectedAt: collectedAt?.toISOString() ?? null,
    collectionDateApprox: Boolean(collectedAt),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
