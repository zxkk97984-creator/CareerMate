import { describe, expect, it } from "vitest";
import { AGENTIC_V2_PREFIX_MAX_CHARS, buildAgenticV2EnhancedQuestion, ContextBudgetError, fitJsonToBudget } from "./agentic-v2-prefix";

describe("Agentic V2 prefix budget", () => {
  it("keeps a small payload valid and parseable", () => {
    const fitted = fitJsonToBudget({ businessData: { schemaVersion: "1", hello: "世界" } }, 2_000);
    expect(fitted.truncated).toBe(false);
    expect(() => JSON.parse(JSON.stringify(fitted.value))).not.toThrow();
  });

  it("uses the 24k platform-tested default budget", () => {
    expect(AGENTIC_V2_PREFIX_MAX_CHARS).toBe(24_000);
    const fitted = fitJsonToBudget({ businessData: { text: "x".repeat(20_000) } });
    expect(fitted.chars).toBeLessThanOrEqual(24_000);
    expect(fitted.truncated).toBe(false);
  });

  it("trims large nested values without cutting JSON in half", () => {
    const value = {
      businessData: {
        schemaVersion: "1",
        historySnapshot: {
          data: {
            recentProgress: Array.from({ length: 100 }, (_, index) => ({
              title: `进度 ${index} ${"长文本".repeat(200)}`,
            })),
            recentSimulations: Array.from({ length: 30 }, () => ({
              transcript: Array.from({ length: 20 }, () => ({ content: "回答".repeat(100) })),
            })),
          },
        },
      },
    };
    const fitted = fitJsonToBudget(value, 12_000);
    expect(fitted.chars).toBeLessThanOrEqual(12_000);
    expect(fitted.truncated).toBe(true);
    expect(() => JSON.parse(JSON.stringify(fitted.value))).not.toThrow();
  });

  it("does not split a surrogate pair when trimming strings", () => {
    const fitted = fitJsonToBudget({ businessData: { text: "😀".repeat(10_000) } }, 1_000);
    const serialized = JSON.stringify(fitted.value);
    expect(serialized).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it("drops whole sections in a deterministic order before failing", () => {
    const value = {
      businessData: {
        historySnapshot: {
          data: {
            recentSimulations: ["x".repeat(20_000), "y".repeat(20_000)],
            recentProgress: ["z".repeat(20_000), "w".repeat(20_000)],
          },
        },
      },
    };
    const fitted = fitJsonToBudget(value, 300);
    expect(fitted.droppedPaths.length).toBeGreaterThan(0);
    expect(() => JSON.parse(JSON.stringify(fitted.value))).not.toThrow();
  });

  it("throws a typed error instead of returning malformed JSON when budget is impossible", () => {
    expect(() => fitJsonToBudget({ businessData: { text: "x".repeat(100_000) } }, 100))
      .toThrow(ContextBudgetError);
  });

  it("builds a question prefix that remains JSON-parseable", () => {
    const question = buildAgenticV2EnhancedQuestion("下一步做什么？", {
      schemaVersion: "1",
      historySnapshot: { data: { recentProgress: [{ title: "x".repeat(30_000) }] } },
    }, 4_000);
    const json = question.split("用户原始问题：")[0]!.split("\n")[1]!;
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("keeps the active plan action structure when compacting a large history snapshot", () => {
    const action = {
      id: "action-1",
      title: "完成 SQL 聚合查询",
      description: "使用公开销售数据完成查询并记录过滤逻辑".repeat(20),
      estimatedHours: 4,
      outputs: ["查询结果"],
      acceptanceCriteria: ["能解释分组和过滤条件"],
    };
    const fitted = fitJsonToBudget({
      businessData: {
        historySnapshot: {
          data: {
            activePlan: {
              id: "plan-1",
              version: 2,
              phases: Array.from({ length: 3 }, (_, phase) => ({
                id: `phase-${phase}`,
                actions: Array.from({ length: 8 }, (_, index) => ({ ...action, id: `${phase}-${index}` })),
              })),
            },
          },
        },
      },
    }, 12_000);

    const businessData = fitted.value as {
      businessData: { historySnapshot: { data: { activePlan: { phases: Array<{ actions: unknown }> } } } };
    };
    expect(businessData.businessData.historySnapshot.data.activePlan.phases[0].actions).toBeInstanceOf(Array);
  });
});
