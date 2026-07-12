import { prepareCareerChat } from "./server";
import { createChatService, type ChatService } from "./service";
import { streamChatWithTboxProgressive } from "@/lib/tbox/streaming";
import { getTboxConfig } from "@/lib/env";
import { writeSseEvent } from "./sse";
import { createArtifactsForChat } from "./artifact-service";
import { errorPart } from "./artifacts";

// ── 类型 ──────────────────────────────────────────────────

export interface StreamingOptions {
  userId: string;
  conversationId: string;
  message: string;
  signal?: AbortSignal;
}

// ── 渐进式流：ReadableStream 模式 ───────────────────────────

/**
 * 处理流式聊天请求，返回 ReadableStream SSE 响应。
 *
 * 通过回调模式实现真正的渐进式输出——
 * 每个 delta 到达后立即写入 SSE 流，不等待全部收集完成。
 * 同时在内存中累计完整正文用于最终持久化。
 *
 * 持久化顺序：
 * 1. 用户消息 + 助手占位消息（status=streaming）+ 更新会话时间
 * 2. 调用百宝箱
 * 3. 每个 delta 立即写入 SSE + 内存累计
 * 4. 完成后一次性持久化助手消息（content + parts + meta + status=completed）
 * 5. 失败时保留用户消息，助手标记为 failed，写入安全 error 部件
 * 6. 客户端断开时不撤销已持久化的用户输入
 */
export async function handleStreamRequest(
  options: StreamingOptions,
  service?: ChatService,
): Promise<Response> {
  const { userId, conversationId, message, signal } = options;
  const svc = service ?? createChatService();

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

  const config = getTboxConfig();

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
        finalMeta = await streamChatWithTboxProgressive(
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

        // 文本完成后生成结构化业务卡片。卡片失败不应抹掉已经完成的回答。
        const parts = await createArtifactsForChat({
          userId,
          conversationId,
          message,
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

        // 发送 done 事件
        writeSseEvent(controller, "done", {
          messageId: assistantMsg.id,
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
