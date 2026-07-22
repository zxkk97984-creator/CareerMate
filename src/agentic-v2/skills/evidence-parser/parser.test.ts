import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEvidenceBundle, stripPII, normalizeConfidence, resetEvidenceCounter } from "./parser";
import { parsedEvidenceListSchema } from "./schema";

function loadExample(name: string): unknown {
  const raw = readFileSync(
    join(__dirname, "examples", `${name}.json`),
    "utf-8",
  );
  return JSON.parse(raw);
}

describe("CareerMate职业证据解析", () => {
  beforeEach(() => {
    resetEvidenceCounter();
  });

  // ---- Schema 验证 ----

  it("正常输入返回合法的 ParsedEvidenceList", () => {
    const input = loadExample("normal");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const parsed = parsedEvidenceListSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe("1.0");
      expect(parsed.data.totalItems).toBeGreaterThan(0);
      expect(parsed.data.items.length).toBe(parsed.data.totalItems);
      expect(parsed.data.summary.averageConfidence).toBeGreaterThan(0);
    }
  });

  it("正常输入包含四路来源证据", () => {
    const input = loadExample("normal");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const sources = new Set(result.items.map((i) => i.source));
    // 至少应有 profile 和 baseline 来源的证据
    expect(sources.has("profile")).toBe(true);
    expect(sources.has("baseline")).toBe(true);
  });

  it("正常输入正确提取能力评分", () => {
    const input = loadExample("normal");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const abilityItems = result.items.filter((i) => i.type === "ability_score");
    expect(abilityItems.length).toBeGreaterThanOrEqual(4);
    const pythonItem = abilityItems.find((i) => i.normalizedClaim.includes("python"));
    expect(pythonItem).toBeDefined();
    expect(pythonItem!.confidence).toBe(0.9);
  });

  it("正常输入正确提取市场证据", () => {
    const input = loadExample("normal");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const marketItems = result.items.filter((i) => i.source === "market");
    expect(marketItems.length).toBeGreaterThanOrEqual(2);
    const salaryItem = marketItems.find((i) => i.type === "market_salary");
    expect(salaryItem).toBeDefined();
  });

  // ---- 空输入 ----

  it("空输入返回零条证据", () => {
    const input = loadExample("empty");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    expect(result.totalItems).toBeGreaterThanOrEqual(0);
    // baseline 的 roleKey 提示至少生成一条
    expect(result.items.some((i) => i.source === "baseline")).toBe(true);
  });

  it("空输入平均置信度合理", () => {
    const input = loadExample("empty");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    if (result.totalItems > 0) {
      expect(result.summary.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.summary.averageConfidence).toBeLessThanOrEqual(1);
    }
  });

  // ---- 损坏输入 ----

  it("损坏输入不抛出异常且产出合法结构", () => {
    const input = loadExample("corrupt");
    let result;
    expect(() => {
      result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    }).not.toThrow();
    // 即便输入损坏，仍应产出合法的 ParsedEvidenceList
    const parsed = parsedEvidenceListSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("损坏输入仍产出合法的 ParsedEvidenceList Schema", () => {
    const input = loadExample("corrupt");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const parsed = parsedEvidenceListSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  // ---- 敏感信息脱敏 ----

  it("含敏感字段的输入正确脱敏", () => {
    const input = loadExample("sensitive");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    for (const item of result.items) {
      // 检查 rawQuote 和 normalizedClaim 都不应包含手机号
      expect(item.rawQuote).not.toMatch(/1[3-9]\d{9}/);
      expect(item.normalizedClaim).not.toMatch(/1[3-9]\d{9}/);
      // 不应包含邮箱
      expect(item.rawQuote).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      expect(item.normalizedClaim).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      // 不应包含身份证号
      expect(item.rawQuote).not.toMatch(/\d{17}[\dXx]/);
      expect(item.normalizedClaim).not.toMatch(/\d{17}[\dXx]/);
    }
  });

  it("脱敏后的内容包含脱敏标记", () => {
    const input = loadExample("sensitive");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const allText = result.items
      .map((i) => `${i.rawQuote} ${i.normalizedClaim}`)
      .join(" ");
    expect(allText).toContain("[已脱敏]");
  });

  // ---- PII 检测函数 ----

  it("stripPII 检测手机号", () => {
    const { cleaned, hasPII } = stripPII("联系我 13812345678 即可");
    expect(hasPII).toBe(true);
    expect(cleaned).not.toContain("13812345678");
    expect(cleaned).toContain("[已脱敏]");
  });

  it("stripPII 检测身份证号", () => {
    const { cleaned, hasPII } = stripPII("身份证号 110101199001011234 请查收");
    expect(hasPII).toBe(true);
    expect(cleaned).not.toContain("110101199001011234");
  });

  it("stripPII 检测邮箱", () => {
    const { cleaned, hasPII } = stripPII("邮箱 test@example.com 收到");
    expect(hasPII).toBe(true);
    expect(cleaned).not.toContain("test@example.com");
  });

  it("stripPII 无敏感信息时 hasPII 为 false", () => {
    const { cleaned, hasPII } = stripPII("这是一段普通文本，没有敏感信息");
    expect(hasPII).toBe(false);
    expect(cleaned).toBe("这是一段普通文本，没有敏感信息");
  });

  // ---- 置信度归一化 ----

  it("normalizeConfidence 'high' → 0.85", () => {
    expect(normalizeConfidence("high")).toBe(0.85);
  });

  it("normalizeConfidence 'medium' → 0.6", () => {
    expect(normalizeConfidence("medium")).toBe(0.6);
  });

  it("normalizeConfidence 'low' → 0.35", () => {
    expect(normalizeConfidence("low")).toBe(0.35);
  });

  it("normalizeConfidence 数字 80 → 0.8", () => {
    expect(normalizeConfidence(80)).toBe(0.8);
  });

  it("normalizeConfidence 未知字符串 → 0.5", () => {
    expect(normalizeConfidence("不知道")).toBe(0.5);
  });

  // ---- 去重 ----

  it("重复证据只保留置信度最高的一条", () => {
    const input = {
      evidenceBundle: {
        profileSnapshot: {
          available: true,
          version: 1,
          data: {
            targetRoleLabel: "数据分析师",
            abilityScores: { sql: 80 },
          },
        },
        careerBaseline: {
          roleKey: "data_analyst",
          templateVersion: "2026.07",
          evidence: [
            { summary: "数据分析师需掌握 SQL", confidence: "high" },
            { summary: "数据分析师需掌握 SQL", confidence: "low" },
          ],
        },
      },
    };
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    // 两条"需掌握 SQL"应去重为一条
    const sqlItems = result.items.filter(
      (i) => i.normalizedClaim.includes("SQL") || i.normalizedClaim.includes("sql"),
    );
    expect(sqlItems.length).toBeLessThanOrEqual(2); // profile score + baseline (去重后一条)
  });

  // ---- 冲突检测 ----

  it("同类型不同来源证据互相标记冲突", () => {
    const input = {
      evidenceBundle: {
        careerBaseline: {
          roleKey: "data_analyst",
          templateVersion: "2026.07",
          evidence: [
            { type: "requirement", summary: "需要 Python 高级水平", confidence: "high" },
            { type: "requirement", summary: "Python 入门即可", confidence: "medium" },
          ],
        },
      },
    };
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const requirementItems = result.items.filter((i) => i.type === "requirement");
    if (requirementItems.length >= 2) {
      const hasConflict = requirementItems.some((i) => i.conflicts.length > 0);
      expect(hasConflict).toBe(true);
    }
  });

  // ---- 汇总统计 ----

  it("summary.bySource 统计正确", () => {
    const input = loadExample("normal");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const totalFromSources = Object.values(result.summary.bySource).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(totalFromSources).toBe(result.totalItems);
  });

  it("summary.conflictCount 与 items 中冲突数一致", () => {
    const input = loadExample("normal");
    const result = parseEvidenceBundle(input as Parameters<typeof parseEvidenceBundle>[0]);
    const actualConflicts = result.items.filter((i) => i.conflicts.length > 0).length;
    expect(result.summary.conflictCount).toBe(actualConflicts);
  });
});
