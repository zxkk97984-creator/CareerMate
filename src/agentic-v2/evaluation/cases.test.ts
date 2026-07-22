import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface EvalCase {
  caseId: string;
  scenario: string;
  category: string;
  input: Record<string, unknown>;
  expectedBehavior: string;
  verificationMethod: string;
}

interface EvalData {
  meta: {
    totalCases: number;
  };
  cases: EvalCase[];
}

const CASES_PATH = join(__dirname, "cases.json");

const REQUIRED_CATEGORIES = [
  "personalization",
  "evidence-fusion",
  "search-integration",
  "unknown-role",
  "agent-routing",
  "conflict-resolution",
  "error-handling",
  "skip-search",
  "scoring",
  "candidate-confirmation",
  "version-conflict",
  "simulation",
  "memory",
  "data-isolation",
  "auth-boundary",
  "quality",
  "privacy",
  "extensibility",
  "authorization",
  "memory-boundary",
  "priority",
  "fallback",
  "data-integrity",
  "security",
  "search-config",
];

describe("评测数据集", () => {
  let data: EvalData;

  beforeAll(() => {
    const raw = readFileSync(CASES_PATH, "utf-8");
    data = JSON.parse(raw);
  });

  it("至少包含 40 条测试用例", () => {
    expect(data.cases.length).toBeGreaterThanOrEqual(40);
  });

  it("实际数量与 meta.totalCases 一致", () => {
    expect(data.cases.length).toBe(data.meta.totalCases);
  });

  it("每个用例包含全部必填字段", () => {
    for (const c of data.cases) {
      expect(c.caseId, `${c.caseId}: 缺少 caseId`).toBeTruthy();
      expect(c.scenario, `${c.caseId}: 缺少 scenario`).toBeTruthy();
      expect(c.category, `${c.caseId}: 缺少 category`).toBeTruthy();
      expect(c.input, `${c.caseId}: 缺少 input`).toBeTypeOf("object");
      expect(c.expectedBehavior, `${c.caseId}: 缺少 expectedBehavior`).toBeTruthy();
      expect(
        c.expectedBehavior.length,
        `${c.caseId}: expectedBehavior 长度应 >= 15`,
      ).toBeGreaterThanOrEqual(15);
      expect(c.verificationMethod, `${c.caseId}: 缺少 verificationMethod`).toBeTruthy();
      expect(
        c.verificationMethod.length,
        `${c.caseId}: verificationMethod 长度应 > 10`,
      ).toBeGreaterThan(10);
    }
  });

  it("caseId 唯一无重复", () => {
    const ids = data.cases.map((c) => c.caseId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("覆盖所有必需场景类别", () => {
    const covered = new Set(data.cases.map((c) => c.category));
    const uncovered = REQUIRED_CATEGORIES.filter((cat) => !covered.has(cat));
    expect(uncovered, `未覆盖的类别: ${uncovered.join(", ")}`).toEqual([]);
  });

  it("输入数据不含敏感信息", () => {
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/1[3-9]\d{9}/);
    expect(json).not.toMatch(/\d{17}[\dXx]/);
    expect(json).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  });

  it("每个类别至少 1 条用例", () => {
    const byCategory = new Map<string, number>();
    for (const c of data.cases) {
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    }
    for (const [cat, count] of byCategory) {
      expect(count, `类别 ${cat} 用例数不足`).toBeGreaterThanOrEqual(1);
    }
  });
});
