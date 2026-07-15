/**
 * 百宝箱在线契约探针（脱敏版本 v2）
 *
 * 用法：npm run tbox:probe
 * 环境：需要 TBOX_MODE=api 和有效的 .env.local 配置
 *
 * 安全约束：
 * - 输出只包含 SafeProbeResult 数组，不含密钥、完整请求体、原始错误消息
 * - 异常经 safeErrorNote() 统一脱敏
 * - 在线模式需显式确认（--yes 参数）
 * - 使用 probe-{timestamp} 一次性 user_id，代号 CM-HISTORY-731
 */

import { loadEnvConfig } from "@next/env";
import { consumeChatResponse } from "../src/lib/tbox/client";
import { parseUpstreamSse } from "../src/lib/tbox/sse";
import { createAssistantResultAccumulator } from "../src/lib/tbox/result";
import { getTboxConfig } from "../src/lib/env";
import {
  HISTORY_CODE,
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
} from "../src/lib/tbox/probe-judge";
import type {
  ProbeObservation,
  CitationObservation,
  ContextSizeObservation,
} from "../src/lib/tbox/probe-judge";
import type { SafeProbeResult } from "../src/lib/tbox/client";

// ── 加载 .env.local ──────────────────────────────

loadEnvConfig(process.cwd());

// ── 固定一次性测试数据 ──────────────────────────

const PROBE_USER_ID = `probe-${Date.now()}`;

// ── 核心流式调用 ─────────────────────────────────

interface RawProbeOutput {
  conversationId?: string;
  text: string;
  structured?: unknown;
  eventNames: string[];
  citations: CitationObservation[];
}

async function callTboxApi(question: string, opts?: {
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  businessData?: Record<string, unknown>;
  searchEngine?: boolean;
}): Promise<RawProbeOutput> {
  const config = getTboxConfig();

  const result = await consumeChatResponse(
    {
      question,
      userId: PROBE_USER_ID,
      conversationId: opts?.conversationId,
      history: opts?.history,
      context: opts?.businessData,
      searchEngine: opts?.searchEngine ?? config.searchEngine,
    } as Parameters<typeof consumeChatResponse>[0],
    true,
    { config, fetchImpl: fetch },
    async (response, onActivity) => {
      if (!response.body) throw new Error("无响应体");

      const acc = createAssistantResultAccumulator();
      const eventNames: string[] = [];
      let completed = false;

      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        eventNames.push(event.type);
        if (event.type === "done") completed = true;
        acc.consume(event);
      }

      if (!completed) throw new Error("SSE 流未正常终止");

      const final = acc.finalize();
      return { eventNames, final };
    },
  );

  const { eventNames, final: assistantResult } = result;

  return {
    conversationId: assistantResult.conversationId,
    text: assistantResult.text,
    structured: assistantResult.structured,
    eventNames,
    citations: (assistantResult.citations as CitationObservation[]) ?? [],
  };
}

function toObservation(raw: RawProbeOutput, overrides?: Partial<ProbeObservation>): ProbeObservation {
  return {
    text: raw.text,
    conversationId: raw.conversationId,
    eventNames: raw.eventNames,
    citations: raw.citations,
    structured: raw.structured,
    ...overrides,
  };
}

function safeResult(
  name: string,
  obs: ProbeObservation,
  pass: boolean,
  note: string,
): SafeProbeResult {
  return {
    name,
    status: pass ? "pass" : "fail",
    httpOk: true,
    actualMode: "api",
    eventNames: obs.eventNames,
    hasConversationId: Boolean(obs.conversationId),
    hasText: Boolean(obs.text),
    hasStructuredResult: obs.structured !== undefined && obs.structured !== null,
    citationCount: obs.citations.length,
    note,
  };
}

function safeFailResult(name: string, err: unknown, partialObs?: ProbeObservation): SafeProbeResult {
  return {
    name,
    status: "fail",
    httpOk: false,
    actualMode: "api",
    eventNames: partialObs?.eventNames ?? [],
    hasConversationId: Boolean(partialObs?.conversationId),
    hasText: Boolean(partialObs?.text),
    hasStructuredResult: false,
    citationCount: partialObs?.citations?.length ?? 0,
    note: safeErrorNote(err),
  };
}

// ── 9 个探针场景（含 followup_structured）─────────

async function probeBasicSse(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi("请用一句话介绍 CareerMate，并返回一个简单的 Markdown 列表。");
    const obs = toObservation(raw);
    const j = judgeBasicSse(obs);
    return safeResult("basic_sse", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("basic_sse", err);
  }
}

async function probeConversationId(): Promise<SafeProbeResult> {
  try {
    // 第一轮：告知代号
    const r1 = await callTboxApi(
      `请记住本次测试代号：${HISTORY_CODE}。请在后续回复中引用此代号。`,
    );

    if (!r1.conversationId) {
      return safeResult("conversation_id", toObservation(r1), false, "首轮未返回 conversation_id");
    }

    // 第二轮：不携带代号，依赖远端记忆
    const r2 = await callTboxApi("刚才我告诉你的测试代号是什么？", {
      conversationId: r1.conversationId,
    });

    // 第三轮：不携带代号，独立回忆（修复假阳性：R3 不再携带 HISTORY_CODE）
    const r3 = await callTboxApi("请再次确认我最初给你的测试代号，并说明这是第几轮对话。", {
      conversationId: r1.conversationId,
    });

    const j = judgeConversationId({
      r1: toObservation(r1),
      r2: toObservation(r2),
      r3: toObservation(r3),
    });

    return {
      name: "conversation_id",
      status: j.pass ? "pass" : "fail",
      httpOk: true,
      actualMode: "api",
      eventNames: [...new Set([...r1.eventNames, ...r2.eventNames, ...r3.eventNames])],
      hasConversationId: true,
      hasText: Boolean(r1.text && r2.text && r3.text),
      hasStructuredResult: false,
      citationCount: 0,
      note: j.note,
    };
  } catch (err) {
    return safeFailResult("conversation_id", err);
  }
}

async function probeHistory(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi("请复述我之前告诉你的测试代号。", {
      history: [
        { role: "user", content: `请记住一次性测试代号 ${HISTORY_CODE}，只用于本次契约测试。` },
        { role: "assistant", content: `已记住测试代号：${HISTORY_CODE}。` },
      ],
    });
    const obs = toObservation(raw);
    const j = judgeHistory(obs);
    return safeResult("history", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("history", err);
  }
}

async function probeBusinessData(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi(
      "根据你的了解，我的目标岗位、每周学习时间和学习偏好分别是什么？",
      {
        businessData: {
          profile: {
            targetRole: "database_administrator",
            targetRoleLabel: "数据库管理员（DBA）",
            weeklyAvailableHours: 10,
            learningPreference: ["practice"],
          },
        },
      },
    );
    const obs = toObservation(raw);
    const j = judgeBusinessData(obs);
    return safeResult("business_data", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("business_data", err);
  }
}

async function probeTextAndResult(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi(
      "请用一句话介绍 CareerMate，同时在结构化输出中返回一个 agent_response 对象（含 schemaVersion 和 intent 字段）。",
    );
    const obs = toObservation(raw);
    const j = judgeTextAndResult(obs);
    return safeResult("text_and_result", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("text_and_result", err);
  }
}

async function probeFollowupStructured(): Promise<SafeProbeResult> {
  try {
    // 使用同一个百宝箱 Agent，显式要求仅返回结构化 JSON
    const raw = await callTboxApi(
      "请仅返回一个 agent_response JSON 对象，schemaVersion=1，intent=general，operations 和 questions 为空数组。不要包含任何 Markdown 或自然语言文本。",
    );
    const obs = toObservation(raw);
    const j = judgeFollowupStructured(obs);
    return safeResult("followup_structured", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("followup_structured", err);
  }
}

async function probeSearchAndCitation(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi(
      "请调研 DBA（数据库管理员）当前常见的职责、入门技能和岗位变化趋势。区分外部事实与 AI 推断。",
      { searchEngine: true },
    );
    const obs = toObservation(raw);
    const j = judgeSearchAndCitation(obs);
    return safeResult("search_and_citation", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("search_and_citation", err);
  }
}

async function probeInvalidConversation(): Promise<SafeProbeResult> {
  try {
    await callTboxApi("你好", {
      conversationId: "fake-nonexistent-conversation-id-999999",
    });

    // 如果没有抛异常，说明百宝箱容忍了无效 ID——这是假阳性
    return {
      name: "invalid_conversation",
      status: "fail", // 修复：不再是 pass
      httpOk: true,
      actualMode: "api",
      eventNames: [],
      hasConversationId: true,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "伪造远端 ID 被容忍（200 OK），未返回会话无效错误——无法确认恢复信号",
    };
  } catch (err) {
    // 尝试从 TboxError 中提取 HTTP 状态和错误码
    const msg = String(err instanceof Error ? err.message : err);
    const httpStatusMatch = msg.match(/status\s*(\d{3})/i);
    const httpStatus = httpStatusMatch ? Number(httpStatusMatch[1]) : undefined;
    const codeMatch = msg.match(/code[:\s]+"?(\w+)"?/i);
    const errorCode = codeMatch ? codeMatch[1] : undefined;

    const obs: ProbeObservation = {
      text: "",
      eventNames: [],
      citations: [],
      httpStatus,
      errorCode,
    };

    const j = judgeInvalidConversation(obs);
    return safeResult("invalid_conversation", obs, j.pass, j.note);
  }
}

async function probeContextSize(): Promise<SafeProbeResult> {
  const paddingSizes = [2000, 4000, 8000, 12000, 16000];
  const observations: ContextSizeObservation[] = [];

  for (const size of paddingSizes) {
    try {
      const padding = "X".repeat(size);
      await callTboxApi("请用一句话回复：收到。", {
        businessData: { padding },
      });
      observations.push({ size, success: true });
    } catch {
      observations.push({ size, success: false });
      break;
    }
  }

  const j = judgeContextSize(observations);
  return {
    name: "context_size",
    status: j.pass ? "pass" : "fail",
    httpOk: j.lastSuccess > 0,
    actualMode: "api",
    eventNames: [],
    hasConversationId: false,
    hasText: j.lastSuccess > 0,
    hasStructuredResult: false,
    citationCount: 0,
    note: j.note,
  };
}

// ── 确认门 ────────────────────────────────────────

function showConfirmationGate() {
  console.error("╔══════════════════════════════════════════════╗");
  console.error("║  百宝箱在线契约探针 — 确认门                ║");
  console.error("╠══════════════════════════════════════════════╣");
  console.error("║  即将向百宝箱 API 发起 10+ 次真实请求        ║");
  console.error("║  使用一次性探针用户 ID，不影响生产数据        ║");
  console.error("║  所有输出经脱敏处理，不含密钥或完整请求体     ║");
  console.error("╚══════════════════════════════════════════════╝");
  console.error("");
  console.error("请确认运行在线探针：npm run tbox:probe -- --yes");
  console.error("");
}

// ── 主流程 ───────────────────────────────────────

async function main() {
  const config = getTboxConfig();

  // 确认门：在线模式需要 --yes
  const hasYes = process.argv.includes("--yes") || process.argv.includes("-y");
  if (config.mode === "api" && !hasYes) {
    showConfirmationGate();
    process.exit(0);
  }

  // 非 api 模式全部标记 blocked
  if (config.mode !== "api") {
    const blockedResults: SafeProbeResult[] = [
      "basic_sse", "conversation_id", "history", "business_data",
      "text_and_result", "followup_structured", "search_and_citation",
      "invalid_conversation", "context_size",
    ].map((name) => ({
      name,
      status: "blocked" as const,
      httpOk: false,
      actualMode: config.mode,
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `TBOX_MODE=${config.mode}，非 api 模式无法执行真实探针`,
    }));

    console.log(JSON.stringify({
      results: blockedResults,
      meta: { mode: config.mode, timestamp: new Date().toISOString() },
    }, null, 2));
    return;
  }

  console.error("🔍 百宝箱契约探针 v2 开始运行...\n");
  console.error(`   Agent ID: ${config.agentId.slice(0, 8)}...`);
  console.error(`   搜索开关: ${config.searchEngine}`);
  console.error(`   探针用户: ${PROBE_USER_ID}\n`);

  const results: SafeProbeResult[] = [];

  console.error("1/9 basic_sse...");
  results.push(await probeBasicSse());

  console.error("2/9 conversation_id（连续三轮，R2/R3 独立回忆）...");
  results.push(await probeConversationId());

  console.error("3/9 history（仅通过 history 传代号）...");
  results.push(await probeHistory());

  console.error("4/9 business_data（DBA+10h+实践，防泄露）...");
  results.push(await probeBusinessData());

  console.error("5/9 text_and_result（正文+合法 agent_response）...");
  results.push(await probeTextAndResult());

  console.error("6/9 followup_structured（同一 Agent 的 followup 结构化）...");
  results.push(await probeFollowupStructured());

  console.error("7/9 search_and_citation（工具+citation+有效URL）...");
  results.push(await probeSearchAndCitation());

  console.error("8/9 invalid_conversation（伪造 ID 的精确认定）...");
  results.push(await probeInvalidConversation());

  console.error("9/9 context_size（lastSuccess/firstFailure）...");
  results.push(await probeContextSize());

  // 脱敏 JSON 到 stdout
  console.log(JSON.stringify({
    results,
    meta: {
      mode: config.mode,
      searchEngine: config.searchEngine,
      historyMode: config.historyMode,
      contextTransport: config.contextTransport,
      structuredMode: config.structuredMode,
      agentIdPrefix: config.agentId.slice(0, 8),
      timestamp: new Date().toISOString(),
    },
  }, null, 2));

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const blockedCount = results.filter((r) => r.status === "blocked").length;
  console.error(`\n📊 探针完成：${passCount} 通过 / ${failCount} 失败 / ${blockedCount} 阻塞`);
}

main().catch((err) => {
  // 仅输出脱敏错误到 stderr
  console.error(`探针脚本异常：${safeErrorNote(err)}`);
  process.exit(1);
});
