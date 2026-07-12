import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { parseJson, toJson } from "@/lib/json";
import { ALLOWED_CANDIDATE_FIELDS } from "@/lib/profile/candidate-service";
import type { AbilityScores } from "@/lib/types";
import { createToolRegistry, McpError, type ToolContext } from "./registry";

const emptyInput = z.object({}).strict();
const candidateInput = z.object({
  field: z.string().min(1).max(120),
  newValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown())]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  evidenceExcerpt: z.string().max(1_000).default(""),
  impactSummary: z.string().max(1_000).default(""),
  sourceConversationId: z.string().min(1).max(100).optional(),
}).strict();
const coursesInput = z.object({
  query: z.string().trim().max(120).optional(),
  roleKey: z.string().trim().max(120).optional(),
  abilityKey: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
const jobsInput = z.object({
  query: z.string().trim().max(120).optional(),
  roleKey: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
const progressInput = z.object({
  eventType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(1_000).default(""),
  relatedPlanId: z.string().trim().min(1).max(100).optional(),
}).strict();

function requireAllowedField(field: string) {
  if (!ALLOWED_CANDIDATE_FIELDS.has(field)) {
    throw new McpError("INVALID_PARAMS", "画像字段不在允许白名单中");
  }
}

function candidateOldValue(profile: Record<string, unknown>, field: string) {
  if (!field.startsWith("abilityScores.")) return profile[field] ?? null;
  const key = field.slice("abilityScores.".length);
  const scores = parseJson<AbilityScores>(String(profile.abilityScores ?? "{}"), {} as AbilityScores);
  return scores[key as keyof AbilityScores] ?? null;
}

export function createCareerMateToolRegistry() {
  const db = getPrisma();
  const registry = createToolRegistry();

  registry.register({
    name: "profile.read",
    description: "读取当前 Token 所绑定用户的安全职业画像。",
    inputSchema: emptyInput,
    inputJsonSchema: { type: "object", properties: {}, additionalProperties: false },
    requiredScopes: ["profile:read"],
    async handler(_input, context) {
      const profile = await db.userProfile.findUnique({
        where: { userId: context.userId },
        select: {
          educationStage: true,
          major: true,
          targetRole: true,
          targetRoleLabel: true,
          weeklyAvailableHours: true,
          learningPreference: true,
          experienceSummary: true,
          interestTags: true,
          constraints: true,
          abilityScores: true,
          memoryEnabled: true,
        },
      });
      if (!profile) throw new McpError("NOT_FOUND", "用户画像不存在");
      return {
        ...profile,
        learningPreference: parseJson(profile.learningPreference, []),
        interestTags: parseJson(profile.interestTags, []),
        constraints: parseJson(profile.constraints, []),
        abilityScores: parseJson(profile.abilityScores, {}),
      };
    },
  });

  registry.register({
    name: "profile.candidate.create",
    description: "创建需用户确认的画像更新候选；不会直接修改正式画像。",
    inputSchema: candidateInput,
    inputJsonSchema: {
      type: "object",
      required: ["field", "newValue", "confidence", "reason"],
      properties: {
        field: { type: "string" },
        newValue: {},
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" },
        evidenceExcerpt: { type: "string" },
        impactSummary: { type: "string" },
        sourceConversationId: { type: "string" },
      },
      additionalProperties: false,
    },
    requiredScopes: ["profile:candidates"],
    async handler(rawInput, context: ToolContext) {
      const input = candidateInput.parse(rawInput);
      requireAllowedField(input.field);
      return db.$transaction(async (transaction) => {
        const profile = await transaction.userProfile.findUnique({
          where: { userId: context.userId },
        });
        if (!profile) throw new McpError("NOT_FOUND", "用户画像不存在");

        let abilityEvidenceId: string | undefined;
        if (input.field.startsWith("abilityScores.")) {
          const evidence = await transaction.abilityEvidence.create({
            data: {
              userId: context.userId,
              abilityKey: input.field.slice("abilityScores.".length),
              summary: input.evidenceExcerpt || input.reason,
              sourceType: "chat",
              sourceRef: input.sourceConversationId,
              confidence: input.confidence,
              status: "pending",
            },
          });
          abilityEvidenceId = evidence.id;
        }

        const candidate = await transaction.profileUpdateCandidate.create({
          data: {
            userId: context.userId,
            source: "tbox-plugin",
            field: input.field,
            oldValue: toJson(candidateOldValue(profile as unknown as Record<string, unknown>, input.field)),
            newValue: toJson(input.newValue),
            confidence: input.confidence,
            reason: input.reason,
            sourceConversationId: input.sourceConversationId,
            evidenceExcerpt: input.evidenceExcerpt,
            impactSummary: input.impactSummary,
            abilityEvidenceId,
            status: "pending",
          },
        });
        return { id: candidate.id, status: candidate.status };
      });
    },
  });

  registry.register({
    name: "courses.query",
    description: "按职业、能力维度或关键词查询学习资源。",
    inputSchema: coursesInput,
    inputJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        roleKey: { type: "string" },
        abilityKey: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
      },
      additionalProperties: false,
    },
    requiredScopes: ["courses:read"],
    async handler(rawInput) {
      const input = coursesInput.parse(rawInput);
      return db.resourceItem.findMany({
        where: {
          ...(input.roleKey ? { roleKey: input.roleKey } : {}),
          ...(input.abilityKey ? { abilityKey: input.abilityKey } : {}),
          ...(input.query ? { title: { contains: input.query } } : {}),
        },
        take: input.limit,
        orderBy: { title: "asc" },
      });
    },
  });

  registry.register({
    name: "jobs.query",
    description: "查询已审核的正式职业模板。",
    inputSchema: jobsInput,
    inputJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        roleKey: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
      },
      additionalProperties: false,
    },
    requiredScopes: ["jobs:read"],
    async handler(rawInput) {
      const input = jobsInput.parse(rawInput);
      return db.roleTemplate.findMany({
        where: {
          ...(input.roleKey ? { roleKey: input.roleKey } : {}),
          ...(input.query ? { roleName: { contains: input.query } } : {}),
        },
        take: input.limit,
        orderBy: { roleName: "asc" },
      });
    },
  });

  registry.register({
    name: "progress.update",
    description: "为当前绑定用户记录一条职业成长进度。",
    inputSchema: progressInput,
    inputJsonSchema: {
      type: "object",
      required: ["eventType", "title"],
      properties: {
        eventType: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        relatedPlanId: { type: "string" },
      },
      additionalProperties: false,
    },
    requiredScopes: ["progress:write"],
    async handler(rawInput, context) {
      const input = progressInput.parse(rawInput);
      const log = await db.progressLog.create({
        data: {
          userId: context.userId,
          eventType: input.eventType,
          title: input.title,
          summary: input.summary,
          relatedPlanId: input.relatedPlanId,
          metadata: "{}",
        },
      });
      return { id: log.id };
    },
  });

  return registry;
}
