import { describe, expect, it } from "vitest";
import {
  HISTORY_CODE,
  classifyError,
  safeErrorNote,
  judgeBasicSse,
  judgeConversationId,
  judgeHistory,
  judgeBusinessData,
  judgeTextAndResult,
  judgeSearchAndCitation,
  judgeInvalidConversation,
  judgeContextSize,
  judgeFollowupStructured,
  isValidAgentResponse,
} from "./probe-judge";
import type {
  ProbeObservation,
  ContextSizeObservation,
} from "./probe-judge";

// ── 测试辅助 ────────────────────────────────────

function baseObs(overrides: Partial<ProbeObservation> = {}): ProbeObservation {
  return {
    text: "",
    eventNames: [],
    citations: [],
    ...overrides,
  };
}

// ── classifyError / safeErrorNote ─────────────────

describe("classifyError", () => {
  it("classifies timeout from AbortError", () => {
    expect(classifyError(new Error("The operation was aborted"))).toBe("timeout");
  });

  it("classifies timeout from timeout message", () => {
    expect(classifyError(new Error("Request timeout after 90000ms"))).toBe("timeout");
  });

  it("classifies auth_failed from 401", () => {
    expect(classifyError(new Error("HTTP 401 Unauthorized"))).toBe("auth_failed");
  });

  it("classifies auth_failed from 403", () => {
    expect(classifyError(new Error("HTTP 403 Forbidden"))).toBe("auth_failed");
  });

  it("classifies config_missing", () => {
    expect(classifyError(new Error("API_CONFIG_MISSING"))).toBe("config_missing");
  });

  it("classifies provider_error from 500", () => {
    expect(classifyError(new Error("HTTP 500 Internal Server Error"))).toBe("provider_error");
  });

  it("classifies sse_incomplete", () => {
    expect(classifyError(new Error("SSE 流未正常终止"))).toBe("sse_incomplete");
  });

  it("classifies empty_response", () => {
    expect(classifyError(new Error("无响应体"))).toBe("empty_response");
  });

  it("classifies network_error", () => {
    expect(classifyError(new Error("fetch failed ECONNREFUSED"))).toBe("network_error");
  });

  it("classifies unknown for unrecognized errors", () => {
    expect(classifyError(new Error("something weird happened"))).toBe("unknown");
  });

  it("handles non-Error throws", () => {
    expect(classifyError("plain string error")).toBe("unknown");
  });
});

describe("safeErrorNote", () => {
  it("never exposes original error message", () => {
    const note = safeErrorNote(new Error("secret-token-abc123 leaked!"));
    expect(note).not.toContain("secret");
    expect(note).not.toContain("abc123");
    expect(note).not.toContain("leaked");
  });

  it.each([
    ["timeout", "请求超时或连接中断"],
    ["auth_failed", "API 认证失败"],
    ["config_missing", "API 配置缺失"],
    ["provider_error", "百宝箱服务端错误"],
    ["sse_incomplete", "SSE 流未正常终止"],
    ["empty_response", "百宝箱返回空响应"],
    ["network_error", "网络连接失败"],
    ["unknown", "探针执行异常（已脱敏）"],
  ] as const)("%s → 包含 '%s'", (kind, expected) => {
    // 模拟每种分类
    const inputs: Record<string, string> = {
      timeout: "AbortError",
      auth_failed: "401 Unauthorized",
      config_missing: "missing config",
      provider_error: "500 error",
      sse_incomplete: "SSE 流未正常终止",
      empty_response: "empty body",
      network_error: "fetch failed",
      unknown: "???",
    };
    const note = safeErrorNote(new Error(inputs[kind]));
    expect(note).toContain(expected);
  });
});

// ── judgeBasicSse ────────────────────────────────

describe("judgeBasicSse", () => {
  it("pass: 有正文和终止事件", () => {
    const result = judgeBasicSse(baseObs({ text: "你好，CareerMate 是...", eventNames: ["text_delta", "done"] }));
    expect(result.pass).toBe(true);
  });

  it("fail: 无正文", () => {
    const result = judgeBasicSse(baseObs({ text: "" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("未收到正文");
  });

  it("fail: 有正文但无终止事件", () => {
    const result = judgeBasicSse(baseObs({ text: "部分内容", eventNames: ["text_delta"] }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("未正常终止");
  });
});

// ── judgeConversationId ──────────────────────────

describe("judgeConversationId", () => {
  it("pass: 三轮同一 ID，R2 和 R3 均独立回忆", () => {
    const result = judgeConversationId({
      r1: baseObs({ conversationId: "conv-1", text: `已记住代号 ${HISTORY_CODE}` }),
      r2: baseObs({ conversationId: "conv-1", text: `你的测试代号是 ${HISTORY_CODE}` }),
      r3: baseObs({ conversationId: "conv-1", text: `确认代号 ${HISTORY_CODE}，这是第三轮` }),
    });
    expect(result.pass).toBe(true);
    expect(result.note).toContain("R2 和 R3 均独立回忆");
  });

  it("fail: 首轮无 conversation_id", () => {
    const result = judgeConversationId({
      r1: baseObs({ conversationId: undefined, text: "..." }),
      r2: baseObs({ conversationId: "conv-1", text: "..." }),
      r3: baseObs({ conversationId: "conv-1", text: "..." }),
    });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("未返回 conversation_id");
  });

  it("fail: 三轮 ID 不一致", () => {
    const result = judgeConversationId({
      r1: baseObs({ conversationId: "conv-1", text: `代号 ${HISTORY_CODE}` }),
      r2: baseObs({ conversationId: "conv-2", text: "..." }),
      r3: baseObs({ conversationId: "conv-1", text: "..." }),
    });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("不一致");
  });

  it("fail: R2 无法独立回忆", () => {
    const result = judgeConversationId({
      r1: baseObs({ conversationId: "conv-1", text: HISTORY_CODE }),
      r2: baseObs({ conversationId: "conv-1", text: "我不记得什么代号" }),
      r3: baseObs({ conversationId: "conv-1", text: `代号是 ${HISTORY_CODE}` }),
    });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("R2 未能独立回忆");
  });

  it("fail: R3 无法独立回忆", () => {
    const result = judgeConversationId({
      r1: baseObs({ conversationId: "conv-1", text: HISTORY_CODE }),
      r2: baseObs({ conversationId: "conv-1", text: `代号 ${HISTORY_CODE}` }),
      r3: baseObs({ conversationId: "conv-1", text: "我不知道" }),
    });
    expect(result.pass).toBe(false);
    expect(result.note).toContain("R3 未能独立回忆");
  });
});

// ── judgeHistory ─────────────────────────────────

describe("judgeHistory", () => {
  it("pass: Agent 通过 history 复述代号", () => {
    const result = judgeHistory(baseObs({ text: `测试代号是 ${HISTORY_CODE}` }));
    expect(result.pass).toBe(true);
  });

  it("fail: 无正文", () => {
    const result = judgeHistory(baseObs({ text: "" }));
    expect(result.pass).toBe(false);
  });

  it("fail: 正文不含代号", () => {
    const result = judgeHistory(baseObs({ text: "我没有收到任何测试代号" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("context_only");
  });
});

// ── judgeBusinessData ────────────────────────────

describe("judgeBusinessData", () => {
  it("pass: 同时命中 DBA、10小时、实践，无内部字段泄露", () => {
    const result = judgeBusinessData(
      baseObs({ text: "您的目标岗位是数据库管理员（DBA），每周可投入10小时学习，偏好动手实践的方式。" }),
    );
    expect(result.pass).toBe(true);
    expect(result.note).toContain("全部命中");
  });

  it("fail: 仅命中 DBA，未命中 10 小时和实践", () => {
    const result = judgeBusinessData(baseObs({ text: "你的目标岗位是DBA，但我不知道你的时间。" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("10小时");
    expect(result.note).toContain("实践");
  });

  it("fail: 命中全部但泄露了 targetRole 字段名", () => {
    const result = judgeBusinessData(
      baseObs({
        text: "根据 business_data 中的 targetRole 字段，你的岗位是 DBA，每周 10 小时，喜欢动手实践。",
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("泄露了内部字段名");
    expect(result.note).toContain("targetRole");
  });

  it("fail: 泄露 business_data 字段名", () => {
    const result = judgeBusinessData(
      baseObs({ text: "从你的 business_data 来看，你每周有 10 小时，目标是 DBA，偏好实践。" }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("business_data");
  });

  it("pass: 10 作为独立词边界匹配（不打 100 误判）", () => {
    // 不含 "10" 作为独立数字，但含 DBA 和实践
    const result = judgeBusinessData(
      baseObs({ text: "你提到目标岗位DBA，偏好动手实践。但我不确定你每周能学多久。" }),
    );
    expect(result.pass).toBe(false); // 缺少 10 小时
  });

  it("fail: 无正文", () => {
    const result = judgeBusinessData(baseObs({ text: "" }));
    expect(result.pass).toBe(false);
  });
});

// ── isValidAgentResponse ─────────────────────────

describe("isValidAgentResponse", () => {
  it("accepts minimal valid agent_response", () => {
    expect(isValidAgentResponse({ schemaVersion: 1, intent: "general" })).toBe(true);
  });

  it("accepts full agent_response with operations and questions", () => {
    expect(
      isValidAgentResponse({
        schemaVersion: 1,
        intent: "career_advice",
        operations: [],
        questions: [],
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidAgentResponse(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidAgentResponse("string")).toBe(false);
  });

  it("rejects missing schemaVersion", () => {
    expect(isValidAgentResponse({ intent: "general" })).toBe(false);
  });

  it("rejects schemaVersion as non-number", () => {
    expect(isValidAgentResponse({ schemaVersion: "1", intent: "general" })).toBe(false);
  });

  it("rejects missing intent", () => {
    expect(isValidAgentResponse({ schemaVersion: 1 })).toBe(false);
  });

  it("rejects empty intent string", () => {
    expect(isValidAgentResponse({ schemaVersion: 1, intent: "" })).toBe(false);
  });

  it("rejects operations as non-array", () => {
    expect(isValidAgentResponse({ schemaVersion: 1, intent: "general", operations: "bad" })).toBe(false);
  });

  it("rejects questions as non-array", () => {
    expect(isValidAgentResponse({ schemaVersion: 1, intent: "general", questions: 123 })).toBe(false);
  });
});

// ── judgeTextAndResult ───────────────────────────

describe("judgeTextAndResult", () => {
  it("pass: 正文 + 合法 agent_response", () => {
    const result = judgeTextAndResult(
      baseObs({
        text: "CareerMate 是...",
        structured: { schemaVersion: 1, intent: "general" },
      }),
    );
    expect(result.pass).toBe(true);
  });

  it("fail: 正文 + 结构化但不合法", () => {
    const result = judgeTextAndResult(
      baseObs({
        text: "CareerMate 是...",
        structured: { someField: "value" },
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("不符合 agent_response 协议");
  });

  it("fail: 仅有正文，无结构化", () => {
    const result = judgeTextAndResult(baseObs({ text: "CareerMate 是...", structured: undefined }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("followup");
  });

  it("fail: 仅有结构化，无正文", () => {
    const result = judgeTextAndResult(
      baseObs({ text: "", structured: { schemaVersion: 1, intent: "general" } }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("无正文");
  });

  it("fail: 既无正文也无结构化", () => {
    const result = judgeTextAndResult(baseObs({ text: "", structured: undefined }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("既无正文");
  });
});

// ── judgeSearchAndCitation ───────────────────────

describe("judgeSearchAndCitation", () => {
  it("pass: 工具事件 + citation + 有效 HTTPS URL", () => {
    const result = judgeSearchAndCitation(
      baseObs({
        text: "DBA 当前职责包括...",
        eventNames: ["text_delta", "tool_start", "tool_end", "citation", "done"],
        citations: [{ url: "https://example.com/dba-trends", title: "DBA Trends", source: "web" }],
      }),
    );
    expect(result.pass).toBe(true);
    expect(result.note).toContain("有效 HTTP(S) URL");
  });

  it("fail: 无搜索工具事件", () => {
    const result = judgeSearchAndCitation(
      baseObs({
        text: "DBA...",
        eventNames: ["text_delta", "done"],
        citations: [{ url: "https://example.com", title: "X" }],
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("无搜索工具事件");
  });

  it("fail: 有工具但无 citation", () => {
    const result = judgeSearchAndCitation(
      baseObs({
        text: "DBA...",
        eventNames: ["text_delta", "tool_start", "done"],
        citations: [],
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("无 citation 事件");
  });

  it("fail: 有 citation 但无有效 URL", () => {
    const result = judgeSearchAndCitation(
      baseObs({
        text: "DBA...",
        eventNames: ["text_delta", "tool_start", "citation", "done"],
        citations: [{ url: "ftp://bad.com", title: "X" }],
      }),
    );
    expect(result.pass).toBe(false);
    expect(result.note).toContain("无有效 HTTP(S) URL");
  });

  it("fail: citation 无 url 字段", () => {
    const result = judgeSearchAndCitation(
      baseObs({
        text: "DBA...",
        eventNames: ["text_delta", "tool_start", "citation", "done"],
        citations: [{ title: "X" }],
      }),
    );
    expect(result.pass).toBe(false);
  });
});

// ── judgeInvalidConversation ─────────────────────

describe("judgeInvalidConversation", () => {
  it("pass: HTTP 404（会话不存在）", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 404 }));
    expect(result.pass).toBe(true);
    expect(result.note).toContain("404");
  });

  it("pass: 错误码含 conversation", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 400, errorCode: "INVALID_CONVERSATION_ID" }));
    expect(result.pass).toBe(true);
  });

  it("pass: CHAT_NOT_FOUND", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 400, errorCode: "CHAT_NOT_FOUND" }));
    expect(result.pass).toBe(true);
  });

  it("fail: 200 OK（伪造 ID 被容忍，假阳性）", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 200, text: "你好！有什么可以帮助你的？" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("被容忍");
  });

  it("fail: 401 认证错误", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 401, errorCode: "unauthorized" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("auth");
  });

  it("fail: 403 禁止访问", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 403, errorCode: "forbidden" }));
    expect(result.pass).toBe(false);
  });

  it("fail: provider_error", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 500, errorCode: "PROVIDER_ERROR" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("provider_error");
  });

  it("fail: timeout", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 0, errorCode: "TIMEOUT" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("timeout");
  });

  it("fail: 错误形态不明确", () => {
    const result = judgeInvalidConversation(baseObs({ httpStatus: 418, errorCode: "TEAPOT" }));
    expect(result.pass).toBe(false);
    expect(result.note).toContain("不明确");
  });
});

// ── judgeContextSize ─────────────────────────────

describe("judgeContextSize", () => {
  it("pass: 所有尺寸通过→至少支持", () => {
    const obs: ContextSizeObservation[] = [
      { size: 2000, success: true },
      { size: 4000, success: true },
      { size: 8000, success: true },
      { size: 12000, success: true },
      { size: 16000, success: true },
    ];
    const result = judgeContextSize(obs);
    expect(result.pass).toBe(true);
    expect(result.note).toContain("至少支持 16000 字符");
    expect(result.note).toContain("已达探测上限");
    expect(result.lastSuccess).toBe(16000);
    expect(result.firstFailure).toBe(0);
    expect(result.recommendedBudget).toBe(12800); // 16000 * 0.8
  });

  it("pass: 12000 通过，16000 失败", () => {
    const obs: ContextSizeObservation[] = [
      { size: 2000, success: true },
      { size: 4000, success: true },
      { size: 8000, success: true },
      { size: 12000, success: true },
      { size: 16000, success: false },
    ];
    const result = judgeContextSize(obs);
    expect(result.pass).toBe(true);
    expect(result.lastSuccess).toBe(12000);
    expect(result.firstFailure).toBe(16000);
    expect(result.recommendedBudget).toBe(9600); // 12000 * 0.8
    expect(result.note).not.toContain("至少支持"); // 不应出现上限语义
  });

  it("pass: 仅 2000 通过（低于 8000）", () => {
    const obs: ContextSizeObservation[] = [
      { size: 2000, success: true },
      { size: 4000, success: false },
    ];
    const result = judgeContextSize(obs);
    expect(result.pass).toBe(true);
    expect(result.lastSuccess).toBe(2000);
    expect(result.firstFailure).toBe(4000);
  });

  it("fail: 全部失败", () => {
    const obs: ContextSizeObservation[] = [{ size: 2000, success: false }];
    const result = judgeContextSize(obs);
    expect(result.pass).toBe(false);
    expect(result.lastSuccess).toBe(0);
  });

  it("handles empty observations", () => {
    const result = judgeContextSize([]);
    expect(result.pass).toBe(false);
    expect(result.lastSuccess).toBe(0);
  });
});

// ── judgeFollowupStructured ──────────────────────

describe("judgeFollowupStructured", () => {
  it("pass: 正文 + 合法 agent_response", () => {
    const result = judgeFollowupStructured(
      baseObs({
        text: "这是结构化操作的结果",
        structured: { schemaVersion: 1, intent: "plan_generation", operations: [] },
      }),
    );
    expect(result.pass).toBe(true);
  });

  it("fail: 仅有正文", () => {
    const result = judgeFollowupStructured(baseObs({ text: "结果", structured: undefined }));
    expect(result.pass).toBe(false);
  });

  it("fail: 结构不合法", () => {
    const result = judgeFollowupStructured(
      baseObs({ text: "结果", structured: { bad: true } }),
    );
    expect(result.pass).toBe(false);
  });
});
