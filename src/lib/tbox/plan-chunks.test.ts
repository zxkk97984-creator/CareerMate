import { describe, expect, it } from "vitest";
import { careerPlanSchema, yearPlanChunkSchema, type YearPlanChunk } from "./schemas";
import { mergeYearChunks } from "./plan";

function chunkForYear(year: number): YearPlanChunk {
  const qStart = (year - 1) * 4 + 1;
  const mStart = (year - 1) * 12 + 1;
  return {
    year: { yearIndex: year, goal: `Year ${year} goal`, expectedOutputs: [`out-${year}`] },
    quarters: Array.from({ length: 4 }, (_, i) => ({
      quarterIndex: qStart + i,
      goal: `Q${qStart + i} goal`,
      milestone: `M${qStart + i}`,
      evaluation: `E${qStart + i}`,
    })),
    months: Array.from({ length: 12 }, (_, i) => ({
      monthIndex: mStart + i,
      goal: `Month ${mStart + i}`,
      learningTasks: [
        {
          id: `t-${mStart + i}`,
          title: `task-${mStart + i}`,
          type: "learn" as const,
          status: "not_started" as const,
        },
      ],
      practiceOutputs: [`po-${mStart + i}`],
      evaluationMetrics: [`em-${mStart + i}`],
    })),
    assumptions: [`assumption-${year}`],
    riskNotes: [`risk-${year}`],
  };
}

describe("year chunk schema", () => {
  it("accepts valid per-year chunks", () => {
    for (const year of [1, 2, 3]) {
      expect(yearPlanChunkSchema.safeParse(chunkForYear(year)).success).toBe(true);
    }
  });

  it("normalizes task aliases, missing ids, and string lists", () => {
    const chunk = chunkForYear(1);
    const month = chunk.months[0]!;
    month.learningTasks = [
      { id: "", title: "x", type: "course", status: "todo" },
      { title: "y", type: "reading", status: "doing" },
    ] as never;
    (month as any).practiceOutputs = "单个字符串";
    (month as any).evaluationMetrics = "另一个字符串";

    const parsed = yearPlanChunkSchema.safeParse(chunk);
    expect(parsed.success).toBe(true);
    const data = parsed.data!;
    expect(data.months[0]!.learningTasks[0]!.type).toBe("learn");
    expect(data.months[0]!.learningTasks[0]!.status).toBe("not_started");
    expect(data.months[0]!.learningTasks[0]!.id).toBe("task-1");
    expect(data.months[0]!.learningTasks[1]!.type).toBe("learn");
    expect(data.months[0]!.learningTasks[1]!.status).toBe("in_progress");
    expect(data.months[0]!.learningTasks[1]!.id).toBe("task-2");
    expect(data.months[0]!.practiceOutputs).toEqual(["单个字符串"]);
    expect(data.months[0]!.evaluationMetrics).toEqual(["另一个字符串"]);
  });

  it("rejects chunks with out-of-range month indices", () => {
    const bad = chunkForYear(1);
    bad.months[11] = { ...bad.months[11]!, monthIndex: 13 };
    expect(yearPlanChunkSchema.safeParse(bad).success).toBe(false);
  });
});

describe("mergeYearChunks", () => {
  it("merges three unordered year chunks into a valid full career plan", () => {
    const merged = mergeYearChunks([chunkForYear(3), chunkForYear(1), chunkForYear(2)]);
    expect(careerPlanSchema.safeParse(merged).success).toBe(true);
    expect(merged.years.map((y) => y.yearIndex)).toEqual([1, 2, 3]);
    expect(merged.quarters.map((q) => q.quarterIndex)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(merged.months).toHaveLength(36);
    expect(merged.months.map((m) => m.monthIndex)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1),
    );
    expect(merged.assumptions).toHaveLength(3);
    expect(merged.riskNotes).toHaveLength(3);
  });
});
