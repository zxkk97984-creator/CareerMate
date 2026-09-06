import { describe, expect, it } from "vitest";
import { buildProviderHistory, resolveSearchPolicy, validateSourceRefs } from "./stream-helpers";

describe("stream-helpers（T22：从 stream-service 纯 helper 拆分，行为不变）", () => {
  it("resolveSearchPolicy: 非职业 scope 一律 off", () => {
    expect(resolveSearchPolicy("帮我看看", { searchPolicy: "required", scope: "general_minimal" })).toBe("off");
    expect(resolveSearchPolicy("帮我看看", { searchPolicy: "required", scope: "privacy" })).toBe("off");
  });

  it("resolveSearchPolicy: 显式联网/时效问题 required", () => {
    expect(resolveSearchPolicy("查一下 2026 薪资趋势", { searchPolicy: "allowed", scope: "career_chat" })).toBe("required");
    expect(resolveSearchPolicy("数据分析师这个职业前景怎么样", { searchPolicy: "allowed", scope: "career_chat" })).toBe("required");
  });

  it("resolveSearchPolicy: 其余回退到会话 searchPolicy", () => {
    expect(resolveSearchPolicy("这个技能怎么练", { searchPolicy: "allowed", scope: "career_chat" })).toBe("allowed");
    expect(resolveSearchPolicy("这个技能怎么练", { searchPolicy: "off", scope: "career_chat" })).toBe("off");
  });

  it("buildProviderHistory: 仅 completed、排除本轮、截断 12 条、每条 800 字", () => {
    const msg = (id: string, role: string, status: string, content: string) => ({ id, role, status, content });
    const messages = [
      msg("u1", "user", "completed", "问题A"),
      msg("a1", "assistant", "completed", "回答A"),
      msg("u2", "user", "completed", "问题B"),
      msg("a2", "assistant", "completed", "回答B"),
      msg("u-drop", "user", "generating", "进行中"), // 非 completed，排除
      msg("u-exclude", "user", "completed", "本轮"), // 本轮，排除
    ];
    const history = buildProviderHistory(messages, "u-exclude");
    expect(history.map((h) => h.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(history.some((h) => h.content === "进行中")).toBe(false);
    expect(history.some((h) => h.content === "本轮")).toBe(false);
  });

  it("buildProviderHistory: 长内容截断到 800 字", () => {
    const long = "x".repeat(2000);
    const history = buildProviderHistory([{ id: "a1", role: "assistant", status: "completed", content: long }], "exclude");
    expect(history[0].content.length).toBe(800);
  });

  it("validateSourceRefs: 只保留落在 citations 范围内的条目", () => {
    const refs = [{ citationIndex: 0, kind: "knowledge_base" }, { citationIndex: 5, kind: "web" }, { citationIndex: -1 }, {}];
    const out = validateSourceRefs(refs as never, [], ["c0", "c1", "c2", "c3", "c4"] as never);
    expect(out).toEqual([{ citationIndex: 0, kind: "knowledge_base" }]);
  });

  it("validateSourceRefs: 空/非法输入返回 []", () => {
    expect(validateSourceRefs(undefined, [], [])).toEqual([]);
    expect(validateSourceRefs([] as never, [], [])).toEqual([]);
  });
});
