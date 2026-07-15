/**
 * 百宝箱在线契约探针 v3（Phase 0 修正版）
 *
 * 用法：
 *   npm run tbox:probe -- --yes                     # 使用 TBOX_AGENT_ID
 *   npm run tbox:probe -- --yes --allow-production-agent  # 明确允许生产 Agent
 *
 * 安全约束：
 * - 输出只包含 SafeProbeResult 数组
 * - 异常经 safeErrorNote() 统一脱敏
 * - 在线模式需 --yes 确认门
 * - 生产 Agent 需额外 --allow-production-agent
 * - 支持 TBOX_PROBE_AGENT_ID 独立探针 Agent
 * - 每场景使用独立 probe user ID 和随机 sentinel
 */

import { loadEnvConfig } from "@next/env";
import { consumeChatResponse } from "../src/lib/tbox/client";
import { TboxError } from "../src/lib/tbox/errors";
import { parseUpstreamSse } from "../src/lib/tbox/sse";
import { createAssistantResultAccumulator } from "../src/lib/tbox/result";
import { getTboxConfig } from "../src/lib/env";
import {
  safeErrorNote,
  classifyError,
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
  BusinessDataSentinels,
} from "../src/lib/tbox/probe-judge";
import type { SafeProbeResult } from "../src/lib/tbox/client";

// ── 加载 .env.local ──────────────────────────────

loadEnvConfig(process.cwd());

// ── 随机工具 ─────────────────────────────────────

function randomSentinel(): string {
  return `S${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function probeUserId(scenario: string): string {
  return `probe-${scenario}-${Date.now()}-${randomSentinel()}`;
}

// ── 核心流式调用 ─────────────────────────────────

interface RawProbeOutput {
  conversationId?: string;
  text: string;
  structured?: unknown;
  eventNames: string[];
  toolNames: string[];
  citations: CitationObservation[];
}

async function callTboxApi(
  scenario: string,
  question: string,
  opts?: {
    conversationId?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    businessData?: Record<string, unknown>;
    searchPolicy?: "off" | "allowed" | "required";
  },
): Promise<RawProbeOutput> {
  const config = getTboxConfig();

  const result = await consumeChatResponse(
    {
      question,
      userId: probeUserId(scenario),
      conversationId: opts?.conversationId,
      history: opts?.history,
      context: opts?.businessData,
      searchPolicy: opts?.searchPolicy,
    },
    true,
    { config, fetchImpl: fetch },
    async (response, onActivity) => {
      if (!response.body) throw new Error("无响应体");

      const acc = createAssistantResultAccumulator();
      const eventNames: string[] = [];
      const toolNames: string[] = [];
      let completed = false;

      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        eventNames.push(event.type);
        if (event.type === "tool_start" && event.name) toolNames.push(event.name);
        if (event.type === "tool_end" && event.name) toolNames.push(event.name);
        if (event.type === "done") completed = true;
        acc.consume(event);
      }

      if (!completed) throw new Error("SSE 流未正常终止");

      const final = acc.finalize();
      return { eventNames, toolNames, final };
    },
  );

  const { eventNames, toolNames, final: assistantResult } = result;

  return {
    conversationId: assistantResult.conversationId,
    text: assistantResult.text,
    structured: assistantResult.structured,
    eventNames,
    toolNames,
    citations: (assistantResult.citations as CitationObservation[]) ?? [],
  };
}

function toObservation(raw: RawProbeOutput, overrides?: Partial<ProbeObservation>): ProbeObservation {
  return {
    text: raw.text,
    conversationId: raw.conversationId,
    eventNames: raw.eventNames,
    toolNames: raw.toolNames,
    citations: raw.citations,
    structured: raw.structured,
    ...overrides,
  };
}

function safeResult(name: string, obs: ProbeObservation, pass: boolean, note: string): SafeProbeResult {
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

function safeFailResult(name: string, err: unknown): SafeProbeResult {
  const obs: ProbeObservation = { text: "", eventNames: [], toolNames: [], citations: [] };
  if (err instanceof TboxError) {
    obs.httpStatus = err.httpStatus;
    obs.errorCode = err.platformCode ?? err.code;
    obs.errorCategory = err.category;
  }
  return {
    name,
    status: "fail",
    httpOk: false,
    actualMode: "api",
    eventNames: [],
    hasConversationId: false,
    hasText: false,
    hasStructuredResult: false,
    citationCount: 0,
    note: safeErrorNote(err),
  };
}

// ── 9 个探针场景 ─────────────────────────────────

async function probeBasicSse(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi("basic_sse", "请用一句话介绍 CareerMate，并返回一个简单的 Markdown 列表。");
    const obs = toObservation(raw);
    const j = judgeBasicSse(obs);
    return safeResult("basic_sse", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("basic_sse", err);
  }
}

async function probeConversationId(): Promise<SafeProbeResult> {
  try {
    const scenarioCode = randomSentinel();
    const r1 = await callTboxApi("conversation_id", `请记住本次测试代号：${scenarioCode}。请在后续回复中引用此代号。`);

    if (!r1.conversationId) {
      return safeResult("conversation_id", toObservation(r1), false, "首轮未返回 conversation_id");
    }

    // R2/R3 不携带代号，独立回忆
    const r2 = await callTboxApi("conversation_id", "刚才我告诉你的测试代号是什么？", {
      conversationId: r1.conversationId,
    });
    const r3 = await callTboxApi("conversation_id", "请再次确认我最初给你的测试代号，并说明这是第几轮对话。", {
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
    const scenarioCode = randomSentinel();
    const raw = await callTboxApi("history", "请复述我之前告诉你的测试代号。", {
      history: [
        { role: "user", content: `请记住一次性测试代号 ${scenarioCode}，只用于本次契约测试。` },
        { role: "assistant", content: `已记住测试代号：${scenarioCode}。` },
      ],
    });
    const obs = toObservation(raw);
    const j = judgeHistory(obs, scenarioCode);
    return safeResult("history", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("history", err);
  }
}

async function probeBusinessData(): Promise<SafeProbeResult> {
  try {
    const sentinels: BusinessDataSentinels = {
      sentinel1: randomSentinel(),
      sentinel2: randomSentinel(),
      sentinel3: randomSentinel(),
    };

    const raw = await callTboxApi("business_data", "请精确复述以下三个代码。只需输出三个代码，用逗号分隔。", {
      businessData: {
        code1: sentinels.sentinel1,
        code2: sentinels.sentinel2,
        code3: sentinels.sentinel3,
      },
    });

    const obs = toObservation(raw);
    const j = judgeBusinessData(obs, sentinels);
    return safeResult("business_data", obs, j.pass, j.note);
  } catch (err) {
    return safeFailResult("business_data", err);
  }
}

async function probeTextAndResult(): Promise<SafeProbeResult> {
  try {
    const raw = await callTboxApi("text_and_result",
      "请用一句话介绍 CareerMate，同时在结构化输出中返回一个 agent_response JSON 对象：schemaVersion=1, intent=general, task.kind=general, task.status=idle，questions=[], operations=[], sourceRefs=[]。",
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
    const raw = await callTboxApi("followup_structured",
      "请仅返回一个 agent_response JSON：schemaVersion=1, intent=general, task.kind=general, task.status=idle, questions=[], operations=[], sourceRefs=[]。",
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
    const raw = await callTboxApi("search_and_citation",
      "请联网搜索：DBA 数据库管理员当前常见的职责和入门技能。请引用具体来源网址。",
      { searchPolicy: "required" },
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
    await callTboxApi("invalid_conversation", "你好", {
      conversationId: "fake-nonexistent-conversation-id-999999",
    });

    return {
      name: "invalid_conversation",
      status: "fail",
      httpOk: true,
      actualMode: "api",
      eventNames: [],
      hasConversationId: true,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "伪造远端 ID 被容忍（200 OK），无法确认会话无效错误形态",
    };
  } catch (err) {
    const obs: ProbeObservation = { text: "", eventNames: [], toolNames: [], citations: [] };
    if (err instanceof TboxError) {
      obs.httpStatus = err.httpStatus;
      obs.errorCode = err.platformCode ?? err.code;
      obs.errorCategory = err.category;
    }
    const j = judgeInvalidConversation(obs);
    return safeResult("invalid_conversation", obs, j.pass, j.note);
  }
}

async function probeContextSize(): Promise<SafeProbeResult> {
  const paddingSizes = [4000, 8000, 12000, 16000];
  const observations: ContextSizeObservation[] = [];

  for (const size of paddingSizes) {
    const sentinel = randomSentinel();
    try {
      const padding = "Z".repeat(size);
      const raw = await callTboxApi("context_size",
        `请只回复以下代码：${sentinel}`,
        {
          businessData: { padding },
        },
      );
      const recalled = raw.text.includes(sentinel);
      observations.push({ size, success: true, inconclusive: false, sentinel, sentinelRecalled: recalled });
    } catch (err) {
      const kind = classifyError(err);
      const isInconclusive = kind === "provider_error" || kind === "auth_failed" || kind === "timeout" || kind === "network_error";
      observations.push({ size, success: false, inconclusive: isInconclusive, sentinel, sentinelRecalled: false });
      if (!isInconclusive) break;
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

function showConfirmationGate(config: ReturnType<typeof getTboxConfig>) {
  const agentId = config.probeAgentId || config.agentId;
  const isProductionAgent = !config.probeAgentId;

  console.error("╔══════════════════════════════════════════════╗");
  console.error("║  百宝箱在线契约探针 v3 — 确认门             ║");
  console.error("╠══════════════════════════════════════════════╣");
  console.error(`║  Agent ID: ${agentId.slice(0, 12)}...`);
  if (isProductionAgent) {
    console.error("║  ⚠ 使用生产 Agent，会产生远端测试会话       ║");
    console.error("║  ⚠ 会占用配额，影响调用统计                 ║");
    console.error("║  建议设置 TBOX_PROBE_AGENT_ID 使用独立 Agent  ║");
  }
  console.error("║  将发起 10+ 次真实 API 请求                  ║");
  console.error("║  使用一次性探针用户 ID，不影响生产数据        ║");
  console.error("║  所有输出经脱敏处理                          ║");
  console.error("╚══════════════════════════════════════════════╝");
  console.error("");
  if (isProductionAgent) {
    console.error("请确认：npm run tbox:probe -- --yes --allow-production-agent");
  } else {
    console.error("请确认：npm run tbox:probe -- --yes");
  }
  console.error("");
}

// ── 主流程 ───────────────────────────────────────

async function main() {
  const config = getTboxConfig();

  const hasYes = process.argv.includes("--yes") || process.argv.includes("-y");
  const hasAllowProduction = process.argv.includes("--allow-production-agent");
  const isProductionAgent = !config.probeAgentId;

  if (config.mode === "api" && !hasYes) {
    showConfirmationGate(config);
    process.exit(0);
  }

  if (config.mode === "api" && isProductionAgent && !hasAllowProduction) {
    console.error("错误：使用生产 Agent 需要额外参数 --allow-production-agent");
    console.error("或设置 TBOX_PROBE_AGENT_ID 环境变量使用独立探针 Agent。");
    process.exit(1);
  }

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
      note: `TBOX_MODE=${config.mode}`,
    }));
    console.log(JSON.stringify({ results: blockedResults, meta: { mode: config.mode } }, null, 2));
    return;
  }

  const agentId = config.probeAgentId || config.agentId;
  console.error("🔍 百宝箱契约探针 v3 开始运行...\n");
  console.error(`   Agent ID: ${agentId.slice(0, 12)}...`);
  console.error(`   搜索开关: ${config.searchEngine}`);
  console.error(`   探针模式: ${isProductionAgent ? "生产 Agent（--allow-production-agent）" : "独立探针 Agent"}\n`);

  const results: SafeProbeResult[] = [];

  console.error("1/9 basic_sse...");
  results.push(await probeBasicSse());

  console.error("2/9 conversation_id...");
  results.push(await probeConversationId());

  console.error("3/9 history...");
  results.push(await probeHistory());

  console.error("4/9 business_data（三随机 sentinel）...");
  results.push(await probeBusinessData());

  console.error("5/9 text_and_result（正式 AgentResponse Schema）...");
  results.push(await probeTextAndResult());

  console.error("6/9 followup_structured...");
  results.push(await probeFollowupStructured());

  console.error("7/9 search_and_citation（搜索工具+citation+URL）...");
  results.push(await probeSearchAndCitation());

  console.error("8/9 invalid_conversation...");
  results.push(await probeInvalidConversation());

  console.error("9/9 context_size（question_prefix+sentinel）...");
  results.push(await probeContextSize());

  const actualSearchEngine = config.searchEngine;
  console.log(JSON.stringify({
    results,
    meta: {
      mode: config.mode,
      searchEngine: actualSearchEngine,
      historyMode: config.historyMode,
      contextTransport: config.contextTransport,
      structuredMode: config.structuredMode,
      reuseRemoteConversationId: config.reuseRemoteConversationId,
      agentIdPrefix: agentId.slice(0, 8),
      timestamp: new Date().toISOString(),
    },
  }, null, 2));

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const blockedCount = results.filter((r) => r.status === "blocked").length;
  console.error(`\n📊 ${passCount} 通过 / ${failCount} 失败 / ${blockedCount} 阻塞`);
}

main().catch((err) => {
  console.error(`探针异常：${safeErrorNote(err)}`);
  process.exit(1);
});
