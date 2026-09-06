import { describe, expect, it } from "vitest";
import {
  buildSuggestionList,
  isProcessable,
  loadSuggestionDetail,
} from "./suggestions";

describe("isProcessable", () => {
  it("only treats explicit pending as processable", () => {
    expect(isProcessable("pending")).toBe(true);
    expect(isProcessable("accepted")).toBe(false);
    expect(isProcessable("rejected")).toBe(false);
    expect(isProcessable("applying")).toBe(false);
  });
});

describe("buildSuggestionList", () => {
  it("normalizes all four sources and counts only processable pending (same source as the list)", () => {
    const { items, pendingCount } = buildSuggestionList({
      profile: [
        { id: "p1", field: "每周可用时间", oldValue: 8, newValue: 10, reason: "最近投入更多", status: "pending", createdAt: "2026-09-01T00:00:00Z" },
        { id: "p2", field: "目标岗位", oldValue: null, newValue: "data_analyst", reason: "更聚焦", status: "accepted", createdAt: null },
      ],
      memory: [
        { id: "m1", content: "喜欢用数据做决策", status: "pending", createdAt: "2026-09-02T00:00:00Z" },
      ],
      plan: [
        { id: "pl1", status: "pending", title: "AI 产品经理 3 个月计划", createdAt: "2026-09-03T00:00:00Z" },
      ],
      artifact: [
        { id: "a1", candidateType: "ability_evidence", status: "pending", createdAt: "2026-09-04T00:00:00Z" },
      ],
    });

    expect(items.map((i) => i.ref.kind)).toEqual(["profile", "memory", "plan", "artifact"]);
    expect(pendingCount).toBe(4);
    // accepted 的不计数、不入列表
    expect(items.some((i) => i.ref.id === "p2")).toBe(false);
  });

  it("dedups by kind+id without guessing by title/time", () => {
    const { items, pendingCount } = buildSuggestionList({
      profile: [
        { id: "p1", field: "某字段", oldValue: null, newValue: "v", reason: "r", status: "pending", createdAt: null },
        { id: "p1", field: "某字段", oldValue: null, newValue: "v", reason: "r", status: "pending", createdAt: null },
      ],
      memory: [], plan: [], artifact: [],
    });
    expect(items).toHaveLength(1);
    expect(pendingCount).toBe(1);
  });

  it("returns zero items when nothing is pending", () => {
    const { items, pendingCount } = buildSuggestionList({
      profile: [{ id: "p1", field: "f", oldValue: null, newValue: "v", reason: "r", status: "accepted", createdAt: null }],
      memory: [], plan: [], artifact: [],
    });
    expect(items).toHaveLength(0);
    expect(pendingCount).toBe(0);
  });
});

describe("loadSuggestionDetail", () => {
  it("dispatches to the loader for the ref kind and returns a typed detail", async () => {
    const result = await loadSuggestionDetail({ kind: "profile", id: "p1" }, {
      profile: async (id) => ({
        ok: true,
        detail: {
          kind: "profile", ref: { kind: "profile", id },
          field: "每周可用时间", oldValue: 8, newValue: 10,
          title: "每周可用时间", status: "pending", reason: "reason",
          evidenceSummary: null, impactSummary: null, source: "api", baseVersion: null, createdAt: null,
        },
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 需要先按 kind 收窄，才能读取该 kind 专属字段
      expect(result.detail.kind).toBe("profile");
      if (result.detail.kind === "profile") {
        expect(result.detail.newValue).toBe(10);
        expect(result.detail.field).toBe("每周可用时间");
      }
    }
  });

  it("returns a typed failure when a kind has no loader", async () => {
    const result = await loadSuggestionDetail({ kind: "artifact", id: "a1" }, {
      profile: async () => ({ ok: false as const, status: 404, message: "" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(501);
  });

  it("surfaces the loader failure with a typeable status", async () => {
    const result = await loadSuggestionDetail({ kind: "plan", id: "pl1" }, {
      plan: async () => ({ ok: false as const, status: 404, message: "建议已不存在" }),
    } as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.message).toBe("建议已不存在");
    }
  });
});
