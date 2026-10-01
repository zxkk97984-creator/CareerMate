import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { readCsvFile } from "../scripts/lib/csv";
import { resourceList, validateResourceRecord } from "../scripts/lib/resource-import-validation";

const RESOURCE_FILE = "data/resources/learning-resources.csv";
const JOB_FILE = "data/jobs/review-job-samples.json";

const optionalDate = z.string().refine((value) => !value || (
  /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value
), "Invalid calendar date");

const resourceRecordSchema = z.object({
  externalKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  type: z.string(),
  roleKey: z.string(),
  abilityKey: z.string(),
  stage: z.string(),
  source: z.string(),
  provider: z.string(),
  difficulty: z.string(),
  url: z.string(),
  estimatedHours: z.string().refine((value) => !value || (Number.isInteger(Number(value)) && Number(value) > 0), "Hours must be a positive integer"),
  description: z.string(),
  detail: z.string(),
  steps: z.string(),
  deliverables: z.string(),
  acceptanceCriteria: z.string(),
  verificationStatus: z.string(),
  lastVerifiedAt: optionalDate,
  validUntil: optionalDate,
}).strict();

function jsonString<T extends z.ZodTypeAny>(schema: T) {
  return z.string().superRefine((value, context) => {
    try {
      if (schema.safeParse(JSON.parse(value)).success) return;
    } catch { /* invalid JSON is rejected below */ }
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid JSON field" });
  });
}

const sourceFiles = z.array(z.string().min(1));
const httpUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value), "URL must use http/https");
const jobRecordSchema = z.object({
  jobId: z.string().trim().min(1),
  roleKey: z.string().regex(/^[a-z0-9_:-]+$/i).nullable(),
  title: z.string().trim().min(1),
  company: z.string().nullable(),
  city: z.string().trim().min(1),
  experience: z.string().nullable(),
  education: z.string().nullable(),
  salaryRaw: z.string(),
  salaryMin: z.number().finite().nullable(),
  salaryMax: z.number().finite().nullable(),
  salaryUnit: z.enum(["month", "day", "hour", "year"]).nullable(),
  salaryMonths: z.number().int().positive().nullable(),
  salaryComparable: z.boolean(),
  salaryNote: z.string(),
  skills: jsonString(z.array(z.string())),
  jobLink: httpUrl.nullable(),
  jd: z.string(),
  sourceFile: jsonString(sourceFiles.min(1)),
  sourceBatch: z.string().min(1),
  collectedAt: z.string().datetime({ offset: true }).nullable(),
  collectionDateApprox: z.boolean(),
  verificationStatus: z.enum(["verified", "unverified", "stale"]),
  detailAvailable: z.boolean(),
  fieldConflicts: jsonString(z.array(z.object({
    field: z.string(),
    values: z.array(z.object({ value: z.string(), sourceFiles }).strict()),
  }).strict())),
}).strict();

const jobCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  notice: z.object({
    purpose: z.string(), source: z.string(), exportedAt: optionalDate,
    verificationStatus: z.literal("unverified"), collectionDateApprox: z.literal(true),
    jobStatus: z.string(), salaryComparability: z.string(),
  }).strict(),
  jobs: z.array(jobRecordSchema).min(1),
}).strict();

export interface ReviewCatalog {
  resources: Prisma.ResourceItemCreateManyInput[];
  jobs: Prisma.JobSampleCreateManyInput[];
}

// Validate both complete files before opening a write transaction. No account data
// or database identifiers are accepted by the public catalog schemas.
export function readReviewCatalog(files: { resourceFile?: string; jobFile?: string } = {}): ReviewCatalog {
  const resourceFile = files.resourceFile ?? RESOURCE_FILE;
  const { records } = readCsvFile(resourceFile);
  if (!records.length) throw new Error("Review resource catalog is empty.");
  const seenResources = new Set<string>();
  const resources = records.map((raw, index): Prisma.ResourceItemCreateManyInput => {
    const record = resourceRecordSchema.parse(raw);
    const errors = validateResourceRecord(record, index + 2, seenResources);
    if (errors.length) throw new Error(errors.join("; "));
    const steps = resourceList(record.steps);
    const deliverables = resourceList(record.deliverables);
    const acceptanceCriteria = resourceList(record.acceptanceCriteria);
    return {
      externalKey: record.externalKey,
      title: record.title,
      type: record.type.trim(),
      roleKey: record.roleKey.trim(),
      abilityKey: record.abilityKey.trim(),
      stage: record.stage.trim() || "all",
      source: record.source.trim(),
      provider: record.provider.trim() || null,
      difficulty: record.difficulty.trim() || null,
      url: record.url.trim() || null,
      estimatedHours: record.estimatedHours ? Number(record.estimatedHours) : null,
      description: record.description.trim(),
      detail: record.detail.trim(),
      steps: JSON.stringify(steps),
      deliverables: JSON.stringify(deliverables),
      acceptanceCriteria: JSON.stringify(acceptanceCriteria),
      verificationStatus: record.verificationStatus,
      lastVerifiedAt: record.lastVerifiedAt ? new Date(record.lastVerifiedAt) : null,
      validUntil: record.validUntil ? new Date(record.validUntil) : null,
      sourceFile: resourceFile,
      sourceBatch: "review-catalog-v1",
      contentHash: createHash("sha256").update(JSON.stringify({ ...record, steps, deliverables, acceptanceCriteria })).digest("hex"),
      status: "active",
    };
  });
  const { jobs } = jobCatalogSchema.parse(JSON.parse(readFileSync(files.jobFile ?? JOB_FILE, "utf8")));
  const seenJobs = new Set<string>();
  for (const job of jobs) {
    if (seenJobs.has(job.jobId)) throw new Error(`Duplicate review job: ${job.jobId}`);
    seenJobs.add(job.jobId);
  }
  return {
    resources,
    jobs: jobs.map((job) => ({ ...job, collectedAt: job.collectedAt ? new Date(job.collectedAt) : null })),
  };
}

// Existing keys are never updated: local edits, verification state and timestamps
// survive a restart or an upgrade from an older reviewer package.
export async function seedReviewCatalog(tx: Prisma.TransactionClient, catalog: ReviewCatalog) {
  const [existingResources, existingJobs] = await Promise.all([
    tx.resourceItem.findMany({ select: { externalKey: true } }),
    tx.jobSample.findMany({ select: { jobId: true } }),
  ]);
  const resourceKeys = new Set(existingResources.map((item) => item.externalKey));
  const jobKeys = new Set(existingJobs.map((item) => item.jobId));
  const missingResources = catalog.resources.filter((item) => !resourceKeys.has(item.externalKey ?? null));
  const missingJobs = catalog.jobs.filter((item) => !jobKeys.has(item.jobId));
  for (let index = 0; index < missingResources.length; index += 100) {
    await tx.resourceItem.createMany({ data: missingResources.slice(index, index + 100) });
  }
  for (let index = 0; index < missingJobs.length; index += 100) {
    await tx.jobSample.createMany({ data: missingJobs.slice(index, index + 100) });
  }
  return { resourcesCreated: missingResources.length, jobsCreated: missingJobs.length };
}
