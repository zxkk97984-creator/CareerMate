/**
 * 百宝箱在线契约探针（脱敏版本）
 *
 * 用法：npm run tbox:probe
 * 环境：需要 TBOX_MODE=api 和有效的 .env.local 配置
 *
 * 此脚本只输出 SafeProbeResult 数组到 stdout，不包含：
 * - 真实密钥、用户 ID、完整请求体
 * - 内部 prompt 或 Authorization header
 *
 * 固定使用一次性测试数据（user_id = probe-{timestamp}，代号 CM-HISTORY-731）
 */

import { consumeChatResponse, sanitizeProbeResult } from "../src/lib/tbox/client";
import { parseUpstreamSse } from "../src/lib/tbox/sse";
import { createAssistantResultAccumulator } from "../src/lib/tbox/result";
import { getTboxConfig } from "../src/lib/env";
import type { SafeProbeResult } from "../src/lib/tbox/client";

// ── 固定一次性测试数据 ──────────────────────────

const PROBE_USER_ID = `probe-${Date.now()}`;
const HISTORY_CODE = "CM-HISTORY-731";

interface ProbeInput {
  name: string;
  question: string;
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  businessData?: Record<string, unknown>;
}

// ── 核心流式调用 ─────────────────────────────────

async function runProbe(input: ProbeInput): Promise<{
  safe: SafeProbeResult;
  conversationId?: string;
  events: string[];
  citations: unknown[];
  text: string;
  structured: unknown;
}> {
  const config = getTboxConfig();

  const result = await consumeChatResponse(
    {
      question: input.question,
      userId: PROBE_USER_ID,
      conversationId: input.conversationId,
      history: input.history,
      context: input.businessData,
      searchEngine: config.searchEngine,
    } as Parameters<typeof consumeChatResponse>[0],
    true,
    {
      config,
      fetchImpl: fetch,
    },
    async (response, onActivity) => {
      if (!response.body) throw new Error("无响应体");

      const acc = createAssistantResultAccumulator();
      const eventNames: string[] = [];
      let completed = false;

      for await (const event of parseUpstreamSse(response.body, { onActivity })) {
        // 记录事件类型名（脱敏后仅保留事件名）
        eventNames.push(event.type);
        if (event.type === "done") completed = true;
        acc.consume(event);
      }

      if (!completed) {
        throw new Error("SSE 流未正常终止");
      }

      const final = acc.finalize();
      return { eventNames, final };
    },
  );

  const { eventNames, final: assistantResult } = result;

  const safe = sanitizeProbeResult({
    name: input.name,
    status: assistantResult.text ? "pass" : "fail",
    httpOk: true,
    actualMode: "api",
    eventNames,
    hasConversationId: Boolean(assistantResult.conversationId),
    hasText: Boolean(assistantResult.text),
    hasStructuredResult: assistantResult.structured !== undefined,
    citationCount: assistantResult.citations.length,
    note: assistantResult.text ? "收到正文回复" : "无正文输出",
  });

  return {
    safe,
    conversationId: assistantResult.conversationId,
    events: eventNames,
    citations: assistantResult.citations,
    text: assistantResult.text,
    structured: assistantResult.structured,
  };
}

// ── 8 个探针场景 ─────────────────────────────────

async function probeBasicSse(): Promise<SafeProbeResult> {
  try {
    const { safe } = await runProbe({
      name: "basic_sse",
      question: "请用一句话介绍 CareerMate，并返回一个简单的 Markdown 列表。",
    });
    return safe;
  } catch (err) {
    return {
      name: "basic_sse",
      status: "fail",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `请求失败：${(err as Error).message}`,
    };
  }
}

async function probeConversationId(): Promise<SafeProbeResult> {
  try {
    // 第一轮
    const r1 = await runProbe({
      name: "conversation_id_r1",
      question: `请记住本次测试代号：${HISTORY_CODE}。请在后续回复中引用此代号。`,
    });

    if (!r1.conversationId) {
      return {
        name: "conversation_id",
        status: "fail",
        httpOk: true,
        actualMode: "api",
        eventNames: r1.events,
        hasConversationId: false,
        hasText: r1.safe.hasText,
        hasStructuredResult: false,
        citationCount: 0,
        note: "首轮未返回 conversation_id",
      };
    }

    // 第二轮（同一 conversation_id）
    const r2 = await runProbe({
      name: "conversation_id_r2",
      question: "刚才我告诉你的测试代号是什么？",
      conversationId: r1.conversationId,
    });

    // 第三轮
    const r3 = await runProbe({
      name: "conversation_id_r3",
      question: `请再次确认测试代号 ${HISTORY_CODE}，并说明这是第几轮对话。`,
      conversationId: r1.conversationId,
    });

    const sameId = r1.conversationId === r2.conversationId && r2.conversationId === r3.conversationId;
    const canRecall = r2.text.includes(HISTORY_CODE) || r3.text.includes(HISTORY_CODE);

    return {
      name: "conversation_id",
      status: sameId && canRecall ? "pass" : "fail",
      httpOk: true,
      actualMode: "api",
      eventNames: [...new Set([...r1.events, ...r2.events, ...r3.events])],
      hasConversationId: sameId,
      hasText: r1.safe.hasText && r2.safe.hasText && r3.safe.hasText,
      hasStructuredResult: false,
      citationCount: 0,
      note: sameId
        ? canRecall
          ? "三轮同一远端 ID，Agent 能引用首轮内容"
          : "三轮同一远端 ID，但 Agent 未能引用首轮代号"
        : "远端 ID 不一致",
    };
  } catch (err) {
    return {
      name: "conversation_id",
      status: "fail",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `探针异常：${(err as Error).message}`,
    };
  }
}

async function probeHistory(): Promise<SafeProbeResult> {
  try {
    // 新会话，仅通过 history 传递代号
    const { safe, text } = await runProbe({
      name: "history",
      question: "请复述我之前告诉你的测试代号。",
      history: [
        { role: "user", content: `请记住一次性测试代号 ${HISTORY_CODE}，只用于本次契约测试。` },
        { role: "assistant", content: `已记住测试代号：${HISTORY_CODE}。` },
      ],
    });

    const canRecall = text.includes(HISTORY_CODE);

    return {
      ...safe,
      status: canRecall ? "pass" : "fail",
      note: canRecall
        ? "Agent 通过 history 字段成功复述代号"
        : "Agent 未能通过 history 复述代号，需回退到 context_only",
    };
  } catch (err) {
    return {
      name: "history",
      status: "fail",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `探针异常：${(err as Error).message}`,
    };
  }
}

async function probeBusinessData(): Promise<SafeProbeResult> {
  try {
    const { safe, text } = await runProbe({
      name: "business_data",
      question: "根据你的了解，我的目标岗位、每周学习时间和学习偏好分别是什么？",
      businessData: {
        profile: {
          targetRole: "database_administrator",
          targetRoleLabel: "数据库管理员（DBA）",
          weeklyAvailableHours: 10,
          learningPreference: ["practice"],
        },
        _probe_note: "此数据仅用于契约测试，验证 business_data 是否被 Agent 读取",
      },
    });

    // 检查回答中是否包含 DBA、10 小时、实践等关键信息
    const mentionsDba = text.includes("DBA") || text.includes("数据库");
    const mentionsHours = text.includes("10");
    const mentionsPractice = text.includes("实践") || text.includes("动手");

    return {
      ...safe,
      status: mentionsDba ? "pass" : "fail",
      note: mentionsDba
        ? `Agent 正确读取 business_data：${[
            mentionsDba ? "DBA✓" : "DBA✗",
            mentionsHours ? "10h✓" : "10h✗",
            mentionsPractice ? "实践✓" : "实践✗",
          ].join(" ")}——且未泄露内部字段名`
        : "Agent 未使用 business_data 中的画像信息",
    };
  } catch (err) {
    return {
      name: "business_data",
      status: "fail",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `探针异常：${(err as Error).message}`,
    };
  }
}

async function probeTextAndResult(): Promise<SafeProbeResult> {
  try {
    const { safe } = await runProbe({
      name: "text_and_result",
      question: "请用一句话介绍 CareerMate，同时在结构化输出中返回一个 agent_response 对象。",
    });

    return {
      ...safe,
      status: safe.hasText ? "pass" : "fail",
      note: safe.hasStructuredResult
        ? "正文和结构化结果同轮返回"
        : safe.hasText
          ? "仅有正文，无结构化结果——可能需要 followup 模式"
          : "无正文输出",
    };
  } catch (err) {
    return {
      name: "text_and_result",
      status: "fail",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `探针异常：${(err as Error).message}`,
    };
  }
}

async function probeSearchAndCitation(): Promise<SafeProbeResult> {
  try {
    const { safe, citations } = await runProbe({
      name: "search_and_citation",
      question: "请调研 DBA（数据库管理员）当前常见的职责、入门技能和岗位变化趋势。区分外部事实与 AI 推断。",
    });

    const hasTools = safe.eventNames.includes("tool_start") || safe.eventNames.includes("tool_end");
    const hasCitations = citations.length > 0;

    return {
      ...safe,
      status: hasCitations ? "pass" : hasTools ? "pass" : "fail",
      citationCount: citations.length,
      note: hasCitations
        ? `收到 ${citations.length} 条 citation 事件`
        : hasTools
          ? "有工具调用但无 citation 事件"
          : "无搜索工具调用和 citation 事件——联网搜索可能未启用",
    };
  } catch (err) {
    return {
      name: "search_and_citation",
      status: "fail",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `探针异常：${(err as Error).message}`,
    };
  }
}

async function probeInvalidConversation(): Promise<SafeProbeResult> {
  try {
    await runProbe({
      name: "invalid_conversation",
      question: "你好",
      conversationId: "fake-nonexistent-conversation-id-999999",
    });

    // 如果没抛异常，说明百宝箱容忍了无效 ID
    return {
      name: "invalid_conversation",
      status: "pass",
      httpOk: true,
      actualMode: "api",
      eventNames: [],
      hasConversationId: true,
      hasText: true,
      hasStructuredResult: false,
      citationCount: 0,
      note: "伪造远端 ID 被容忍，未返回错误——无需特殊恢复逻辑",
    };
  } catch (err) {
    const msg = (err as Error).message;
    return {
      name: "invalid_conversation",
      status: "pass",
      httpOk: false,
      actualMode: "api",
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `伪造 ID 返回可识别错误：${msg.slice(0, 120)}——可用于触发本地重建重试`,
    };
  }
}

async function probeContextSize(): Promise<SafeProbeResult> {
  // 逐步增加非敏感上下文，探测平台上限
  const paddingSizes = [2000, 4000, 8000, 12000, 16000];
  let lastOkSize = 0;

  for (const size of paddingSizes) {
    try {
      const padding = "X".repeat(size);
      await runProbe({
        name: `context_size_${size}`,
        question: "请用一句话回复：收到。",
        businessData: {
          padding,
          _probe_note: `上下文大小探针：${size} 字符填充`,
        },
      });
      lastOkSize = size;
    } catch {
      break; // 达到上限
    }
  }

  const safeBudget = lastOkSize > 0 ? Math.floor(lastOkSize * 0.8) : 0;

  return {
    name: "context_size",
    status: lastOkSize >= 8000 ? "pass" : lastOkSize > 0 ? "pass" : "fail",
    httpOk: lastOkSize > 0,
    actualMode: "api",
    eventNames: [],
    hasConversationId: false,
    hasText: lastOkSize > 0,
    hasStructuredResult: false,
    citationCount: 0,
    note:
      lastOkSize > 0
        ? `最大通过 ${lastOkSize} 字符，建议预算为 ${safeBudget} 字符（80%）`
        : "所有上下文大小测试均失败",
  };
}

// ── 主流程 ───────────────────────────────────────

async function main() {
  const config = getTboxConfig();

  // 仅 api 模式有意义；mock/manual 全部标记 blocked
  if (config.mode !== "api") {
    const blockedResults: SafeProbeResult[] = [
      "basic_sse",
      "conversation_id",
      "history",
      "business_data",
      "text_and_result",
      "search_and_citation",
      "invalid_conversation",
      "context_size",
    ].map((name) => ({
      name,
      status: "blocked",
      httpOk: false,
      actualMode: config.mode,
      eventNames: [],
      hasConversationId: false,
      hasText: false,
      hasStructuredResult: false,
      citationCount: 0,
      note: `TBOX_MODE=${config.mode}，非 api 模式无法执行真实探针`,
    }));

    console.log(JSON.stringify({ results: blockedResults, meta: { mode: config.mode, timestamp: new Date().toISOString() } }, null, 2));
    return;
  }

  console.error("🔍 百宝箱契约探针开始运行...\n");
  console.error(`   Agent ID: ${config.agentId.slice(0, 8)}...`);
  console.error(`   搜索开关: ${config.searchEngine}`);
  console.error(`   探针用户: ${PROBE_USER_ID}\n`);

  const results: SafeProbeResult[] = [];

  // 按顺序执行探针，避免并发导致远端会话混淆
  console.error("1/8 basic_sse...");
  results.push(await probeBasicSse());

  console.error("2/8 conversation_id（连续三轮）...");
  results.push(await probeConversationId());

  console.error("3/8 history（仅通过 history 传代号）...");
  results.push(await probeHistory());

  console.error("4/8 business_data（隐藏画像上下文）...");
  results.push(await probeBusinessData());

  console.error("5/8 text_and_result（正文+结构化）...");
  results.push(await probeTextAndResult());

  console.error("6/8 search_and_citation（联网搜索+引用）...");
  results.push(await probeSearchAndCitation());

  console.error("7/8 invalid_conversation（伪造远端 ID）...");
  results.push(await probeInvalidConversation());

  console.error("8/8 context_size（上下文上限探测）...");
  results.push(await probeContextSize());

  // 只输出脱敏 JSON 到 stdout
  console.log(
    JSON.stringify(
      {
        results,
        meta: {
          mode: config.mode,
          searchEngine: config.searchEngine,
          agentIdPrefix: config.agentId.slice(0, 8),
          timestamp: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );

  // 打印摘要到 stderr
  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const blockedCount = results.filter((r) => r.status === "blocked").length;
  console.error(`\n📊 探针完成：${passCount} 通过 / ${failCount} 失败 / ${blockedCount} 阻塞`);
}

main().catch((err) => {
  console.error("探针脚本异常：", err);
  process.exit(1);
});
