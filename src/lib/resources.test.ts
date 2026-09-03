import { describe, expect, it } from "vitest";
import { filterResources, isAllowedResourceSource } from "./resources";

const items = [
  { id: "1", roleKey: "data_analyst", abilityKey: "dataAnalysis", type: "course", source: "人工整理公开资源" },
  { id: "2", roleKey: "data_analyst", abilityKey: "projectPractice", type: "project", source: "自建脱敏数据" },
  { id: "3", roleKey: "ai_product_manager", abilityKey: "dataAnalysis", type: "course", source: "官方文档" },
];

describe("resource source policy", () => {
  it.each(["人工整理公开资源", "自建实践项目", "官方文档", "授权课程", "公开来源：政府开放数据", "Open Source"]) (
    "allows focused trusted source %s",
    (source) => expect(isAllowedResourceSource(source)).toBe(true),
  );

  it.each(["", "   ", "未授权转载", "网页爬取", "抓取公开资源", "来源不明"]) (
    "rejects missing or clearly unauthorized source %s",
    (source) => expect(isAllowedResourceSource(source)).toBe(false),
  );
});

describe("filterResources", () => {
  it("combines role, ability, and type filters", () => {
    expect(filterResources(items, {
      roleKey: "data_analyst",
      abilityKey: "dataAnalysis",
      type: "course",
    }).map((item) => item.id)).toEqual(["1"]);
  });

  it("treats all as an unfiltered dimension", () => {
    expect(filterResources(items, { roleKey: "data_analyst", abilityKey: "all", type: "all" })).toHaveLength(2);
  });
});
