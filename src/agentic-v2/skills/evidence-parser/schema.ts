import { z } from "zod";

// ---- 输入 ----

/** 证据来源路由 */
export const EVIDENCE_SOURCE_ROUTES = [
  "profile",
  "history",
  "baseline",
  "market",
] as const;

export type EvidenceSourceRoute = (typeof EVIDENCE_SOURCE_ROUTES)[number];

/** 证据类型 */
export const EVIDENCE_TYPES = [
  "ability_score",
  "ability_evidence",
  "progress",
  "plan",
  "requirement",
  "market_trend",
  "market_salary",
  "market_demand",
  "certification",
  "learning_resource",
  "constraint",
  "preference",
  "other",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

// ---- 单项证据 ----

export const evidenceItemSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.enum(EVIDENCE_SOURCE_ROUTES),
  type: z.enum(EVIDENCE_TYPES),
  confidence: z.number().min(0).max(1),
  rawQuote: z.string().min(1).max(2000),
  normalizedClaim: z.string().min(1).max(2000),
  conflicts: z.array(z.string().max(64)).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

// ---- 汇总 ----

export const evidenceSummarySchema = z.object({
  bySource: z.record(z.enum(EVIDENCE_SOURCE_ROUTES), z.number().int().nonnegative()),
  byType: z.record(z.enum(EVIDENCE_TYPES), z.number().int().nonnegative()),
  conflictCount: z.number().int().nonnegative(),
  averageConfidence: z.number().min(0).max(1),
});

export type EvidenceSummary = z.infer<typeof evidenceSummarySchema>;

// ---- 输出 ----

export const parsedEvidenceListSchema = z.object({
  schemaVersion: z.literal("1.0"),
  parsedAt: z.string().datetime({ offset: true }),
  totalItems: z.number().int().nonnegative(),
  items: z.array(evidenceItemSchema),
  summary: evidenceSummarySchema,
});

export type ParsedEvidenceList = z.infer<typeof parsedEvidenceListSchema>;

// ---- 输入 ----

export const parserInputSchema = z.object({
  evidenceBundle: z.object({
    schemaVersion: z.string().optional(),
    request: z.unknown().optional(),
    profileSnapshot: z
      .object({
        available: z.boolean().optional(),
        version: z.number().nullable().optional(),
        data: z.unknown(),
      })
      .optional(),
    historySnapshot: z
      .object({
        available: z.boolean().optional(),
        through: z.string().nullable().optional(),
        data: z.unknown(),
      })
      .optional(),
    careerBaseline: z
      .object({
        roleKey: z.string().optional(),
        templateVersion: z.string().optional(),
        evidence: z.array(z.unknown()).optional(),
      })
      .optional(),
    marketEvidence: z
      .object({
        searched: z.boolean().optional(),
        skipReason: z.string().nullable().optional(),
        collectedAt: z.string().nullable().optional(),
        scope: z.unknown().optional(),
        findings: z.array(z.unknown()).optional(),
        sources: z.array(z.unknown()).optional(),
        conflicts: z.array(z.unknown()).optional(),
        confidence: z.string().optional(),
      })
      .optional(),
  }),
});

export type ParserInput = z.infer<typeof parserInputSchema>;
