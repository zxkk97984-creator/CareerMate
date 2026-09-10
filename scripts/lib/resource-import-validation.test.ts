import { describe, expect, it } from "vitest";
import { validateResourceRecord } from "./resource-import-validation";

function record(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    externalKey: "resource-1",
    title: "SQL 练习",
    type: "practice",
    roleKey: "data_analyst",
    abilityKey: "dataAnalysis",
    source: "自建实践项目",
    verificationStatus: "unverified",
    estimatedHours: "4",
    description: "使用公开数据完成查询练习",
    steps: "下载数据|完成查询|记录结论",
    deliverables: "查询脚本与结果",
    acceptanceCriteria: "能解释过滤和分组逻辑",
    ...overrides,
  };
}

describe("resource import validation", () => {
  it("accepts a complete self-built practice without an external URL", () => {
    expect(validateResourceRecord(record(), 2, new Set())).toEqual([]);
  });

  it("rejects a self-built practice missing steps, deliverables or acceptance", () => {
    const errors = validateResourceRecord(record({
      steps: "",
      deliverables: "",
      acceptanceCriteria: "",
    }), 2, new Set());

    expect(errors).toEqual(expect.arrayContaining([
      "resource-1: 自建实践缺少步骤",
      "resource-1: 自建实践缺少交付物",
      "resource-1: 自建实践缺少验收标准",
    ]));
  });

  it("rejects non-positive estimated hours", () => {
    expect(validateResourceRecord(record({ estimatedHours: "-2" }), 2, new Set()))
      .toContain("resource-1: estimatedHours 必须是正数");
  });
});
