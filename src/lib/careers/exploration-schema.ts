import { z } from "zod";

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

/** 引用来源 schema */
export const explorationSourceSchema = z.object({
  title: z.string().min(1).max(240),
  organization: z.string().min(1).max(240),
  url: z.string().url().optional(),
  accessedAt: z.string().refine(isValidIsoDate, "访问日期必须是有效的 YYYY-MM-DD"),
  label: z.enum(["已核验职业库", "实时联网调研", "AI分析与推断"]),
}).superRefine((source, context) => {
  if (source.label !== "实时联网调研") return;
  if (!source.url) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["url"],
      message: "实时联网调研必须提供来源链接",
    });
    return;
  }
  const protocol = new URL(source.url).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["url"],
      message: "实时联网来源必须使用 HTTP 或 HTTPS",
    });
  }
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
  sources: z.array(explorationSourceSchema).min(1).max(20),
});

export type ExplorationReport = z.infer<typeof explorationReportSchema>;
export type ExplorationSource = z.infer<typeof explorationSourceSchema>;
