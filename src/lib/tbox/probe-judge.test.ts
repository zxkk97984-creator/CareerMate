import { describe, expect, it } from "vitest";
import {
  HISTORY_CODE,
  classifyError,
  safeErrorNote,
  isValidExternalUrl,
  parseAgentResponseStrict,
  judgeBasicSse,
  judgeConversationId,
  judgeHistory,
  judgeBusinessData,
  judgeTextAndResult,
  judgeSearchAndCitation,
  judgeInvalidConversation,
  judgeContextSize,
  judgeFollowupStructured,
  judgeAdversarialNegatives,
} from "./probe-judge";
import type {
  ProbeObservation,
  ContextSizeObservation,
} from "./probe-judge";

function baseObs(overrides: Partial<ProbeObservation> = {}): ProbeObservation {
  return {
    text: "",
    eventNames: [],
    toolNames: [],
    citations: [],
    ...overrides,
  };
}

// ── classifyError / safeErrorNote ─────────────────

describe("classifyError", () => {
  it("classifies timeout from AbortError", () => {
    expect(classifyError(new Error("The operation was aborted"))).toBe("timeout");
  });
  it("classifies auth_failed from 401", () => {
    expect(classifyError(new Error("HTTP 401 Unauthorized"))).toBe("auth_failed");
  });
  it("classifies provider_error from 500", () => {
    expect(classifyError(new Error("HTTP 500 Internal Server Error"))).toBe("provider_error");
  });
  it("classifies network_error", () => {
    expect(classifyError(new Error("fetch failed ECONNREFUSED"))).toBe("network_error");
  });
  it("classifies unknown for unrecognized errors", () => {
    expect(classifyError(new Error("something weird happened"))).toBe("unknown");
  });
});

describe("safeErrorNote", () => {
  it("never exposes original error message", () => {
    const note = safeErrorNote(new Error("secret-token-abc123 leaked!"));
    expect(note).not.toContain("secret");
    expect(note).not.toContain("abc123");
  });
});

// ── isValidExternalUrl ───────────────────────────

describe("isValidExternalUrl", () => {
  it("accepts https URL", () => {
    expect(isValidExternalUrl("https://example.com/dba-trends")).toBe(true);
  });
  it("accepts http URL", () => {
    expect(isValidExternalUrl("http://blog.example.com/article")).toBe(true);
  });
  it("rejects bare https://", () => {
    expect(isValidExternalUrl("https://")).toBe(false);
  });
  it("rejects ftp URL", () => {
    expect(isValidExternalUrl("ftp://example.com")).toBe(false);
  });
  it("rejects localhost", () => {
    expect(isValidExternalUrl("https://localhost:3000/api")).toBe(false);
  });
  it("rejects 127.0.0.1", () => {
    expect(isValidExternalUrl("http://127.0.0.1/test")).toBe(false);
  });
  it("rejects invalid URL string", () => {
    expect(isValidExternalUrl("not a url")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidExternalUrl("")).toBe(false);
  });
  it("rejects null", () => {
    expect(isValidExternalUrl(null)).toBe(false);
  });
});

// ── parseAgentResponseStrict ─────────────────────

describe("parseAgentResponseStrict", () => {
  it("accepts valid agent_response", () => {
    const r = parseAgentResponseStrict({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [],
      sourceRefs: [],
    });
    expect(r.valid).toBe(true);
  });

  it("rejects null", () => {
    expect(parseAgentResponseStrict(null).valid).toBe(false);
  });

  it("rejects undefined", () => {
    expect(parseAgentResponseStrict(undefined).valid).toBe(false);
  });

  it("rejects schemaVersion=999", () => {
    const r = parseAgentResponseStrict({
      schemaVersion: 999,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [],
      sourceRefs: [],
    });
    expect(r.valid).toBe(false);
    expect(r.note).toContain("Schema 不匹配");
  });

  it("rejects operations=[null]", () => {
    const r = parseAgentResponseStrict({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [null],
      sourceRefs: [],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects arbitrary intent string", () => {
    const r = parseAgentResponseStrict({
      schemaVersion: 1,
      intent: "do_whatever",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [],
      sourceRefs: [],
    });
    expect(r.valid).toBe(false);
  });
});

// ── judgeBasicSse ────────────────────────────────

describe("judgeBasicSse", () => {
  it("pass: 有正文和终止事件", () => {
    expect(judgeBasicSse(baseObs({ text: "Hello", eventNames: ["text_delta", "done"] })).pass).toBe(true);
  });
  it("fail: 无正文", () => {
    expect(judgeBasicSse(baseObs({ text: "" })).pass).toBe(false);
  });
});

// ── judgeConversationId ──────────────────────────

describe("judgeConversationId", () => {
  it("pass: 三轮同一 ID，R2/R3 独立回忆", () => {
    const r = judgeConversationId({
      r1: baseObs({ conversationId: "c1", text: HISTORY_CODE }),
      r2: baseObs({ conversationId: "c1", text: `代号 ${HISTORY_CODE}` }),
      r3: baseObs({ conversationId: "c1", text: `确认 ${HISTORY_CODE}` }),
    });
    expect(r.pass).toBe(true);
  });
  it("fail: R2 无法回忆", () => {
    const r = judgeConversationId({
      r1: baseObs({ conversationId: "c1", text: HISTORY_CODE }),
      r2: baseObs({ conversationId: "c1", text: "不知道" }),
      r3: baseObs({ conversationId: "c1", text: HISTORY_CODE }),
    });
    expect(r.pass).toBe(false);
    expect(r.note).toContain("R2");
  });
  it("fail: ID 不一致", () => {
    const r = judgeConversationId({
      r1: baseObs({ conversationId: "c1", text: HISTORY_CODE }),
      r2: baseObs({ conversationId: "c2", text: HISTORY_CODE }),
      r3: baseObs({ conversationId: "c1", text: HISTORY_CODE }),
    });
    expect(r.pass).toBe(false);
  });
});

// ── judgeHistory ─────────────────────────────────

describe("judgeHistory", () => {
  it("pass: 通过 history 复述代号", () => {
    expect(judgeHistory(baseObs({ text: HISTORY_CODE }), HISTORY_CODE).pass).toBe(true);
  });
  it("fail: 不含代号", () => {
    expect(judgeHistory(baseObs({ text: "不知道" }), HISTORY_CODE).pass).toBe(false);
  });
});

// ── judgeBusinessData（三 sentinel）──────────────

describe("judgeBusinessData", () => {
  const sentinels = { sentinel1: "ALPHA-771", sentinel2: "BRAVO-882", sentinel3: "CHARLIE-993" };

  it("pass: 三 sentinel 全部精确复述", () => {
    expect(judgeBusinessData(
      baseObs({ text: "收到：ALPHA-771, BRAVO-882, CHARLIE-993" }),
      sentinels,
    ).pass).toBe(true);
  });
  it("fail: 仅命中两个", () => {
    expect(judgeBusinessData(
      baseObs({ text: "ALPHA-771 和 CHARLIE-993" }),
      sentinels,
    ).pass).toBe(false);
  });
  it("fail: 泄露 internal field", () => {
    expect(judgeBusinessData(
      baseObs({ text: "business_data 中：ALPHA-771, BRAVO-882, CHARLIE-993" }),
      sentinels,
    ).pass).toBe(false);
  });
});

// ── judgeTextAndResult ───────────────────────────

describe("judgeTextAndResult", () => {
  it("pass: 正文+合法 AgentResponse", () => {
    expect(judgeTextAndResult(baseObs({
      text: "Hello",
      structured: { schemaVersion: 1, intent: "general", task: { kind: "general", status: "idle" }, questions: [], operations: [], sourceRefs: [] },
    })).pass).toBe(true);
  });
  it("fail: schemaVersion=999", () => {
    expect(judgeTextAndResult(baseObs({
      text: "Hello",
      structured: { schemaVersion: 999, intent: "general" },
    })).pass).toBe(false);
  });
  it("fail: operations=[null]", () => {
    expect(judgeTextAndResult(baseObs({
      text: "Hello",
      structured: { schemaVersion: 1, intent: "general", task: { kind: "general", status: "idle" }, questions: [], operations: [null], sourceRefs: [] },
    })).pass).toBe(false);
  });
  it("fail: 任意 intent", () => {
    expect(judgeTextAndResult(baseObs({
      text: "Hello",
      structured: { schemaVersion: 1, intent: "delete_all_data", task: { kind: "general", status: "idle" }, questions: [], operations: [], sourceRefs: [] },
    })).pass).toBe(false);
  });
});

// ── judgeSearchAndCitation ───────────────────────

describe("judgeSearchAndCitation", () => {
  it("pass: 搜索工具+citation+有效URL", () => {
    expect(judgeSearchAndCitation(baseObs({
      text: "DBA...",
      toolNames: ["web_search"],
      citations: [{ url: "https://example.com/dba", title: "DBA" }],
    })).pass).toBe(true);
  });
  it("fail: url=https://（裸协议）", () => {
    expect(judgeSearchAndCitation(baseObs({
      text: "DBA...",
      toolNames: ["search_engine"],
      citations: [{ url: "https://" }],
    })).pass).toBe(false);
  });
  it("fail: 无搜索工具", () => {
    expect(judgeSearchAndCitation(baseObs({
      text: "DBA...",
      toolNames: [],
      citations: [{ url: "https://example.com" }],
    })).pass).toBe(false);
  });
  it("fail: 工具+citation 但 URL 无效", () => {
    expect(judgeSearchAndCitation(baseObs({
      text: "DBA...",
      toolNames: ["search"],
      citations: [{ url: "https://localhost/test" }],
    })).pass).toBe(false);
  });
});

// ── judgeInvalidConversation ─────────────────────

describe("judgeInvalidConversation", () => {
  it("pass: HTTP 404 + CHAT_NOT_FOUND", () => {
    expect(judgeInvalidConversation(baseObs({ httpStatus: 404, errorCode: "CHAT_NOT_FOUND" })).pass).toBe(true);
  });
  it("fail: 200 OK（容忍伪造ID）", () => {
    expect(judgeInvalidConversation(baseObs({ httpStatus: 200, text: "Hello" })).pass).toBe(false);
  });
  it("fail: 404 但无匹配错误码", () => {
    expect(judgeInvalidConversation(baseObs({ httpStatus: 404, errorCode: "SOMETHING_ELSE" })).pass).toBe(false);
  });
  it("fail: 401 认证错误", () => {
    expect(judgeInvalidConversation(baseObs({ httpStatus: 401, errorCode: "unauthorized" })).pass).toBe(false);
  });
  it("fail: 5xx", () => {
    expect(judgeInvalidConversation(baseObs({ httpStatus: 500, errorCode: "PROVIDER_ERROR" })).pass).toBe(false);
  });
  it("fail: CONVERSATION_RATE_LIMITED (非无效会话)", () => {
    expect(judgeInvalidConversation(baseObs({ httpStatus: 429, errorCode: "CONVERSATION_RATE_LIMITED" })).pass).toBe(false);
  });
});

// ── judgeContextSize ─────────────────────────────

describe("judgeContextSize", () => {
  it("pass: 所有尺寸通过→至少支持（非平台上限）", () => {
    const obs: ContextSizeObservation[] = [
      { size: 4000, success: true, inconclusive: false, sentinel: "X1", sentinelRecalled: true },
      { size: 8000, success: true, inconclusive: false, sentinel: "X2", sentinelRecalled: true },
      { size: 12000, success: true, inconclusive: false, sentinel: "X3", sentinelRecalled: true },
      { size: 16000, success: true, inconclusive: false, sentinel: "X4", sentinelRecalled: true },
    ];
    const r = judgeContextSize(obs);
    expect(r.pass).toBe(true);
    expect(r.note).toContain("至少支持 16000");
    expect(r.note).toContain("非平台真实上限");
    expect(r.recommendedBudget).toBe(12000);
  });

  it("skips inconclusive entries (5xx)", () => {
    const obs: ContextSizeObservation[] = [
      { size: 4000, success: true, inconclusive: false, sentinel: "X1", sentinelRecalled: true },
      { size: 8000, success: false, inconclusive: true, sentinel: "X2", sentinelRecalled: false },
      { size: 12000, success: true, inconclusive: false, sentinel: "X3", sentinelRecalled: true },
    ];
    const r = judgeContextSize(obs);
    // 8000 was inconclusive (5xx), skipped; 12000 passed
    expect(r.lastSuccess).toBe(12000);
    expect(r.firstFailure).toBe(0);
  });

  it("fail: sentinel not recalled even if HTTP OK", () => {
    const obs: ContextSizeObservation[] = [
      { size: 4000, success: true, inconclusive: false, sentinel: "X1", sentinelRecalled: false },
    ];
    const r = judgeContextSize(obs);
    expect(r.lastSuccess).toBe(0);
  });
});

// ── judgeFollowupStructured ──────────────────────

describe("judgeFollowupStructured", () => {
  it("pass: 合法 AgentResponse（允许无正文）", () => {
    expect(judgeFollowupStructured(baseObs({
      text: "",
      structured: { schemaVersion: 1, intent: "plan_generation", task: { kind: "plan_generation", status: "ready" }, questions: [], operations: [], sourceRefs: [] },
    })).pass).toBe(true);
  });
  it("pass: 正文+合法 AgentResponse", () => {
    expect(judgeFollowupStructured(baseObs({
      text: "Done",
      structured: { schemaVersion: 1, intent: "general", task: { kind: "general", status: "idle" }, questions: [], operations: [], sourceRefs: [] },
    })).pass).toBe(true);
  });
  it("fail: 不合法结构化", () => {
    expect(judgeFollowupStructured(baseObs({
      text: "X",
      structured: { bad: true },
    })).pass).toBe(false);
  });
});

// ── judgeAdversarialNegatives ────────────────────

describe("judgeAdversarialNegatives", () => {
  it("pass: all correctly rejected", () => {
    expect(judgeAdversarialNegatives([
      { label: "schemaVersion=999", valid: false },
      { label: "operations=[null]", valid: false },
      { label: "arbitrary intent", valid: false },
      { label: "url=https://", valid: false },
    ]).pass).toBe(true);
  });
  it("fail: one slipped through", () => {
    expect(judgeAdversarialNegatives([
      { label: "ok", valid: false },
      { label: "BAD", valid: true },
    ]).pass).toBe(false);
  });
});
