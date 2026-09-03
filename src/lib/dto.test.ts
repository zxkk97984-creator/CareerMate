import { describe, expect, it } from "vitest";
import { planDto } from "./dto";

describe("planDto", () => {
  it("exposes updatedAt and preserves all 36 months", () => {
    const months = Array.from({ length: 36 }, (_, index) => ({ monthIndex: index + 1 }));
    const result = planDto({
      id: "plan-1",
      targetRole: "data_analyst",
      version: 1,
      status: "active",
      years: "[]",
      quarters: "[]",
      months: JSON.stringify(months),
      currentMonthIndex: 1,
      assumptions: "[]",
      riskNotes: "[]",
      generationMeta: "{}",
      sourceReportId: null,
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
      updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    });

    expect(result.months).toHaveLength(36);
    expect(result.updatedAt).toBe("2026-07-11T00:00:00.000Z");
  });
});
