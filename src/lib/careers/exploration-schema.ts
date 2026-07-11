import { z } from "zod";

/** 引用来源 schema */
export const explorationSourceSchema = z.object({
  title: z.string().min(1).max(240),
  organization: z.string().min(1).max(240),
  url: z.string().url().optional(),
  accessedAt: z.string(),
  label: z.enum(["已核验职业库", "实时联网调研", "AI分析与推断"]),
});

/** 职业探索报告完整 schema */
export const explorationReportSchema = z.object({
  roleName: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000),
  responsibilities: z.array(z.string()).max(10),
  coreCompetencies: z.array(z.string()).max(12),
  entryPaths: z.array(z.string()).max(6),
  marketSignals: z.array(z.string()).max(8),
  learningSuggestions: z.array(z.string()).max(8),
  fitAnalysis: z.array(z.string()).max(6),
  risksAndUncertainties: z.array(z.string()).max(6),
  sources: z.array(explorationSourceSchema).max(20),
});

export type ExplorationReport = z.infer<typeof explorationReportSchema>;
export type ExplorationSource = z.infer<typeof explorationSourceSchema>;
