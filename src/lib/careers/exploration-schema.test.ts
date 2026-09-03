import { describe, expect, it } from "vitest";
import { explorationReportSchema, explorationSourceSchema } from "./exploration-schema";

const source = {
  title: "职业标准",
  organization: "权威机构",
  url: "https://example.org/standard",
  accessedAt: "2026-07-12",
  label: "实时联网调研" as const,
};

const report = {
  roleName: "用户研究员",
  summary: "职业探索摘要",
  responsibilities: [],
  coreCompetencies: [],
  entryPaths: [],
  marketSignals: [],
  learningSuggestions: [],
  fitAnalysis: [],
  risksAndUncertainties: [],
  sources: [source],
};

describe("exploration source validation", () => {
  it("requires a URL for a live research source", () => {
    expect(explorationSourceSchema.safeParse({ ...source, url: undefined }).success).toBe(false);
  });

  it("rejects an invalid access date", () => {
    expect(explorationSourceSchema.safeParse({
      ...source,
      accessedAt: "2026-02-31",
    }).success).toBe(false);
  });

  it("requires every report to retain at least one traceable source", () => {
    expect(explorationReportSchema.safeParse({
      ...report,
      sources: [],
    }).success).toBe(false);
  });

  it("accepts an inference source without a URL", () => {
    expect(explorationSourceSchema.safeParse({
      ...source,
      url: undefined,
      label: "AI分析与推断",
    }).success).toBe(true);
  });
});
