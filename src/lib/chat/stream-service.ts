import { prepareCareerChat } from "./server";
import { createChatService, type ChatService } from "./service";
import { streamChatWithTboxProgressive } from "@/lib/tbox/streaming";
import { parseStructuredAssistantResult } from "@/lib/tbox/structured-result";
import { getTboxConfig, isStatefulChatTurns } from "@/lib/env";
import { writeSseEvent } from "./sse";
import { createArtifactsForChat } from "./artifact-service";
import { errorPart } from "./artifacts";
import { createTurnService, TurnServiceError } from "./turn-service";

// ── 类型 ──────────────────────────────────────────────────

export interface StreamingOptions {
  userId: string;
  conversationId: string;
  message: string;
  clientRequestId: string;
  actionId?: string;
  signal?: AbortSignal;
}

// ── 渐进式流：ReadableStream 模式 ───────────────────────────

/**
 * 处理流式聊天请求，返回 ReadableStream SSE 响应。
 *
 * 当 STATEFUL_CHAT_TURNS 启用时使用两阶段事务：
 * 1. begin() 原子认领轮次、创建消息、幂等检查
 * 2. 调用百宝箱
 * 3. finalize() 完成消息、释放锁 — 或 fail() 处理错误
 *
 * 关闭开关时回退旧编排（直接创建消息 → 调用百宝箱 → 更新消息）。
 */
export async function handleStreamRequest(
  options: StreamingOptions,
  service?: ChatService,
): Promise<Response> {
  const { userId, conversationId, message, clientRequestId, actionId, signal } = options;
  const svc = service ?? createChatService();
  const config = getTboxConfig();

  // 有状态轮次路径（STATEFUL_CHAT_TURNS 开关）
  if (isStatefulChatTurns()) {
    return handleStatefulStream(options, svc, config);
  }

  // ── 旧编排路径（兼容）─────────────────────────────
  return handleLegacyStream(options, svc, config);
}

/** 有状态轮次路径：两阶段事务 + replay 支持 */
async function handleStatefulStream(
  options: StreamingOptions,
  svc: ChatService,
  config: ReturnType<typeof getTboxConfig>,
): Promise<Response> {
  const { userId, conversationId, message, clientRequestId, signal } = options;
  const turnService = createTurnService();

  // ── 短事务 A：认领轮次 ──────────────────────────
  let beginResult: { kind: "new"; turn: { id: string; userMessageId: string; assistantMessageId: string } } | { kind: "replay"; turn: { assistantText: string } };
  try {
    beginResult = await turnService.begin({
      userId,
      conversationId,
      message,
      clientRequestId,
      actionId: options.actionId,
    });
  } catch (err) {
    if (err instanceof TurnServiceError) {
      return new Response(JSON.stringify({ error: { code: err.code, message: err.message } }), {
        status: err.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    throw err;
  }

  // ── 重放路径 ──────────────────────────────────
  if (beginResult.kind === "replay") {
    const stream = new ReadableStream({
      async start(controller) {
        writeSseEvent(controller, "context", {
          conversationId,
          userMessageId: "",
          assistantMessageId: "",
          intent: null,
          usedProfile: false,
          usedPlan: false,
          usedMemoryCount: 0,
          knowledgeSources: [],
        });
        writeSseEvent(controller, "delta", {
          messageId: "",
          text: beginResult.turn.assistantText,
        });
        writeSseEvent(controller, "done", {
          messageId: "",
          remoteConversationId: null,
          status: "completed" as const,
          meta: { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "replay" },
        });
        try { controller.close(); } catch { /* 已关闭 */ }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // ── 新轮次：构建上下文并调用百宝箱 ──────────────────
  const turn = beginResult.turn;

  // 构建安全上下文
  const prepared = await prepareCareerChat(
    { userId, question: message },
  ).catch(() => ({
    enhancedQuestion: message,
    contextMeta: {
      intent: null as string | null,
      usedProfile: false,
      usedPlan: false,
      usedMemoryCount: 0,
      knowledgeSources: [] as string[],
    },
  }));

  // 获取已有远端会话 ID
  const convDetail = await svc.getConversation(conversationId, userId).catch(() => null);
  const existingRemoteId = convDetail?.remoteConversationId ?? undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let remoteConversationId: string | null = null;
      let finalMeta: Record<string, unknown> | null = null;

      try {
        writeSseEvent(controller, "context", {
          conversationId,
          userMessageId: turn.userMessageId,
          assistantMessageId: turn.assistantMessageId,
          ...prepared.contextMeta,
        });

        // 调用百宝箱
        const aiResponse = await streamChatWithTboxProgressive(
          {
            question: prepared.enhancedQuestion,
            userId,
            conversationId: existingRemoteId as string | undefined,
          },
          { config, signal },
          (event) => {
            if (event.meta) finalMeta = event.meta;

            if (event.event === "message" && event.data.type === "delta") {
              fullContent += event.data.content;
              writeSseEvent(controller, "delta", {
                messageId: turn.assistantMessageId,
                text: event.data.content,
              });
            }

            if (event.event === "done") {
              remoteConversationId = event.data.conversationId;
            }
          },
        );
        finalMeta = aiResponse.meta as unknown as Record<string, unknown>;
        remoteConversationId = aiResponse.data.conversationId ?? remoteConversationId;

        // 解析结构化结果
        const assistantResult = parseStructuredAssistantResult(aiResponse.data);
        const parts = await createArtifactsForChat({
          userId,
          conversationId,
          assistantResult,
        }).catch(() => [
          errorPart("ARTIFACT_UNAVAILABLE", "回答已生成，但画像、计划或职业报告卡片暂未生成。"),
        ]);

        for (const part of parts) {
          writeSseEvent(controller, "artifact", {
            messageId: turn.assistantMessageId,
            part,
          });
        }

        // ── 短事务 B：完成轮次 ──────────────────
        await turnService.finalize({
          turn: {
            id: turn.id,
            conversationId,
            userId,
            clientRequestId,
            userMessageId: turn.userMessageId,
            assistantMessageId: turn.assistantMessageId,
          },
          assistantText: fullContent,
          citations: [],
          remoteConversationId: remoteConversationId ?? undefined,
          executionMeta: finalMeta ?? { requestedMode: config.mode, actualMode: config.mode, degraded: false, source: "tbox-api" },
          warnings: assistantResult.warnings ?? [],
        });

        writeSseEvent(controller, "done", {
          messageId: turn.assistantMessageId,
          remoteConversationId,
          status: "completed" as const,
          meta: finalMeta ?? {
            requestedMode: config.mode,
            actualMode: config.mode,
            degraded: false,
            fallbackReason: null,
            source: "tbox-api",
          },
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "未知错误";
        const errorCode = errMessage === "aborted" ? "ABORTED" : "TBOX_UNAVAILABLE";

        // 尝试释放锁
        await turnService.fail({
          turn: {
            id: turn.id,
            conversationId,
            userId,
            clientRequestId,
            userMessageId: turn.userMessageId,
            assistantMessageId: turn.assistantMessageId,
          },
          partialText: fullContent || "",
          code: errorCode,
        }).catch(() => {}); // fail 本身失败也不阻塞 SSE 错误发送

        writeSseEvent(controller, "error", {
          messageId: turn.assistantMessageId,
          code: errorCode,
          message: "这次连接没有成功，你的提问已经保留，可以稍后重试。",
          retryable: errorCode !== "ABORTED",
        });
      } finally {
        try { controller.close(); } catch { /* 可能已关闭 */ }
      }
    },
    cancel() {
      // 客户端断开——用户消息已持久化
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** 旧编排路径（STATEFUL_CHAT_TURNS 关闭时使用） */
async function handleLegacyStream(
  options: StreamingOptions,
  svc: ChatService,
  config: ReturnType<typeof getTboxConfig>,
): Promise<Response> {
  const { userId, conversationId, message, signal } = options;

  // 构建安全上下文（失败时使用最小上下文回退）
  const prepared = await prepareCareerChat(
    { userId, question: message },
  ).catch(() => ({
    enhancedQuestion: message,
    contextMeta: {
      intent: null as string | null,
      usedProfile: false,
      usedPlan: false,
      usedMemoryCount: 0,
      knowledgeSources: [] as string[],
    },
  }));

  // 持久化用户消息和助手占位消息
  const userMsg = await svc.createMessage(userId, {
    conversationId,
    role: "user",
    content: message,
    status: "completed",
  });

  const assistantMsg = await svc.createMessage(userId, {
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
  });

  await svc.touchConversation(conversationId);

  // 尝试用首条消息更新标题
  await svc.updateConversationTitleFromFirstMessage(
    conversationId,
    userId,
    message,
  ).catch(() => {});

  // 获取已有远端会话 ID 用于多轮延续
  const convDetail = await svc.getConversation(conversationId, userId).catch(() => null);
  const existingRemoteId = convDetail?.remoteConversationId ?? undefined;

  // 使用 ReadableStream 实现真正的渐进式输出
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let remoteConversationId: string | null = null;
      let finalMeta: {
        requestedMode: string;
        actualMode: string;
        degraded: boolean;
        fallbackReason: string | null;
        source: string;
      } | null = null;

      try {
        // 发送 context 事件（必须是第一个）
        writeSseEvent(controller, "context", {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          ...prepared.contextMeta,
        });

        // 渐进式调用百宝箱——每个事件到达后立即写入 SSE
        const aiResponse = await streamChatWithTboxProgressive(
          {
            question: prepared.enhancedQuestion,
            userId,
            conversationId: existingRemoteId as string | undefined,
          },
          { config, signal },
          (event) => {
            if (event.meta) finalMeta = event.meta;

            if (event.event === "message" && event.data.type === "delta") {
              fullContent += event.data.content;
              // 立即发送 delta 到浏览器
              writeSseEvent(controller, "delta", {
                messageId: assistantMsg.id,
                text: event.data.content,
              });
            }

            if (event.event === "done") {
              remoteConversationId = event.data.conversationId;
            }
          },
        );
        finalMeta = aiResponse.meta;
        remoteConversationId = aiResponse.data.conversationId ?? remoteConversationId;

        // 文本完成后生成结构化业务卡片。卡片失败不应抹掉已经完成的回答。
        // 使用 parseStructuredAssistantResult 从 Agent 结果提取结构化数据
        const assistantResult = parseStructuredAssistantResult(aiResponse.data);
        const parts = await createArtifactsForChat({
          userId,
          conversationId,
          assistantResult,
        }).catch(() => [
          errorPart(
            "ARTIFACT_UNAVAILABLE",
            "回答已生成，但这次画像、计划或职业报告卡片暂未生成，可以稍后重试。",
          ),
        ]);
        for (const part of parts) {
          writeSseEvent(controller, "artifact", {
            messageId: assistantMsg.id,
            part,
          });
        }

        // 流正常结束：持久化助手消息
        await svc.updateMessage(assistantMsg.id, {
          content: fullContent,
          parts: JSON.stringify(parts),
          status: "completed",
          executionMeta: JSON.stringify(finalMeta ?? {}),
          contextMeta: JSON.stringify({
            intent: prepared.contextMeta.intent,
            usedProfile: prepared.contextMeta.usedProfile,
            usedPlan: prepared.contextMeta.usedPlan,
            usedMemoryCount: prepared.contextMeta.usedMemoryCount,
            knowledgeSources: prepared.contextMeta.knowledgeSources,
          }),
        });

        // 写入远端会话 ID 到会话记录，确保下一轮多轮对话可恢复
        if (remoteConversationId) {
          await svc.touchConversation(conversationId, remoteConversationId).catch(() => {});
        }

        // 发送 done 事件（携带 warnings 和 meta）
        writeSseEvent(controller, "done", {
          messageId: assistantMsg.id,
          remoteConversationId,
          status: "completed" as const,
          warnings: assistantResult.warnings ?? [],
          meta: finalMeta ?? {
            requestedMode: config.mode,
            actualMode: config.mode,
            degraded: false,
            fallbackReason: null,
            source: "tbox-api",
          },
        });
      } catch (err) {
        // 失败：保留用户消息，标记助手失败
        const errMessage = err instanceof Error ? err.message : "未知错误";
        const errorCode = errMessage === "aborted" ? "ABORTED" : "TBOX_UNAVAILABLE";

        await svc.updateMessage(assistantMsg.id, {
          content: fullContent || "",
          parts: JSON.stringify([{
            type: "error",
            code: errorCode,
            message: "这次连接没有成功，你的提问已经保留，可以稍后重试。",
          }]),
          status: "failed",
          executionMeta: JSON.stringify(finalMeta ?? {}),
        });

        writeSseEvent(controller, "error", {
          messageId: assistantMsg.id,
          code: errorCode,
          message: "这次连接没有成功，你的提问已经保留，可以稍后重试。",
          retryable: errorCode !== "ABORTED",
        });
      } finally {
        try { controller.close(); } catch { /* 可能已关闭 */ }
      }
    },
    cancel() {
      // 客户端断开——不撤销已持久化的用户消息
      // 如果上游仍在运行，abort signal 会处理中断
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
