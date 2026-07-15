import { prepareCareerChat } from "./server";
import { createChatService, type ChatService } from "./service";
import { streamChatWithTboxProgressive } from "@/lib/tbox/streaming";
import { parseStructuredAssistantResult, parseTerminalAgentResponse } from "@/lib/tbox/structured-result";
import { getTboxConfig, isStatefulChatTurns } from "@/lib/env";
import { writeSseEvent } from "./sse";
import { createArtifactsForChat } from "./artifact-service";
import { errorPart } from "./artifacts";
import { createTurnService, TurnServiceError } from "./turn-service";
import { buildAgentContext, trimRecentMessages } from "./context-builder";
import { parseConversationState } from "./conversation-state";
import { normalizeCitations } from "@/lib/tbox/citations";
import { createProfileMutationService } from "@/lib/profile/profile-mutation-service";
import { createMemoryProposalService } from "@/lib/memory/proposal-service";
import type { TboxHistoryMessage } from "@/lib/tbox/types";
import type { AgentOperation } from "./agent-protocol";

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
  // 预加载 UserProfile（用于 profileVersion 和后续上下文构建）
  let realProfile: RealProfileFields | null = null;
  try {
    realProfile = await loadRealUserProfile(userId);

    beginResult = await turnService.begin({
      userId,
      conversationId,
      message,
      clientRequestId,
      actionId: options.actionId,
      profileVersion: realProfile?.version ?? 1,
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

  // ── 新轮次：加载历史 + 构建上下文 + 调用百宝箱 ──────
  const turn = beginResult.turn;

  // 并行加载：ChatConversation state、记忆、计划、最近消息、QuestionLedger
  const [convDetail, messages, memories, activePlan, answeredQuestions] = await Promise.all([
    svc.getConversation(conversationId, userId).catch(() => null),
    svc.getMessages(conversationId, userId, undefined, 24).catch(() => []),
    loadContextMemories(userId),
    loadActivePlan(userId),
    loadAnsweredQuestionKeys(conversationId),
  ]);

  // 解析会话状态
  const convState = parseConversationState(convDetail?.state ?? null);

  // 构建最近消息历史（用于 tbox history）
  const recentMessages = messages
    .filter((m) => m.status === "completed" && m.content)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const trimmedHistory = trimRecentMessages(recentMessages);
  const historyMessages: TboxHistoryMessage[] = trimmedHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 构建 AgentContext——使用真实的 UserProfile 字段
  const agentContext = buildAgentContext({
    profile: realProfile ? {
      educationStage: realProfile.educationStage ?? undefined,
      major: realProfile.major ?? undefined,
      targetRole: realProfile.targetRole ?? undefined,
      targetRoleLabel: realProfile.targetRoleLabel ?? undefined,
      weeklyAvailableHours: realProfile.weeklyAvailableHours ?? undefined,
      learningPreference: parseJsonArray(realProfile.learningPreference),
      experienceSummary: realProfile.experienceSummary,
      constraints: parseJsonArray(realProfile.constraints),
    } : null,
    profileVersion: realProfile?.version ?? 1,
    memories: memories.map((m) => ({
      id: m.id,
      kind: m.kind ?? "career_fact",
      content: m.content,
    })),
    activePlan: activePlan ? {
      id: activePlan.id,
      targetRole: activePlan.targetRole,
      summary: activePlan.summary ?? "",
      immediateActions: [],
    } : null,
    conversation: {
      contextVersion: convDetail?.contextVersion ?? 1,
      summary: convDetail?.summary ?? "",
      currentTask: convState.currentTask,
      awaitingQuestion: convState.awaitingQuestion,
      answeredQuestionKeys: answeredQuestions,
      recentMessages: trimmedHistory,
    },
    userMessage: message,
  });

  // 构建安全上下文（用于 question_prefix 模式）
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

  const existingRemoteId = convDetail?.remoteConversationId ?? undefined;

  // 根据配置决定如何传输上下文
  const hasHistory = config.historyMode === "provider" && historyMessages.length > 0;
  const hasContext = config.contextTransport === "business_data";
  const searchPolicy = agentContext.searchPolicy;

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

        // 调用百宝箱——传入历史、上下文和搜索策略
        const aiResponse = await streamChatWithTboxProgressive(
          {
            question: prepared.enhancedQuestion,
            userId,
            conversationId: existingRemoteId as string | undefined,
            history: hasHistory ? historyMessages : undefined,
            context: hasContext ? agentContext : undefined,
            searchPolicy,
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

        // ── AgentResponse 解析（必须先于旧 capability parser，防止 structured 被清除）──
        // 正式主聊天直接从百宝箱显式 terminal structured 字段校验 agentResponseSchema
        // 绝不从 text/Markdown/代码块提取，正文 JSON 零副作用
        let agentResponse: import("./agent-protocol").AgentResponse | undefined;
        const agentResponseResult = parseTerminalAgentResponse(aiResponse.data);

        // TBOX_STRUCTURED_MODE 控制：disabled 时零业务写入
        if (config.structuredMode !== "disabled") {
          agentResponse = agentResponseResult.response;

          // 处理 Agent operations（仅可信 structured mode 下执行）
          if (agentResponse?.operations && agentResponse.operations.length > 0) {
            await processAgentOperations(userId, conversationId, turn.assistantMessageId, message, agentResponse.operations);
          }
        }

        // 解析结构化结果（旧 capability parser——仅用于 artifact 卡片生成）
        const assistantResult = parseStructuredAssistantResult(aiResponse.data);

        // 将 AgentResponse warnings 合并到 assistantResult
        if (agentResponseResult.warnings.length > 0) {
          assistantResult.warnings.push(...agentResponseResult.warnings);
        }

        // 归一化 citations：搜索检测基于 per-turn searchPolicy（required 时启用搜索）
        const hasSearchTool = searchPolicy === "required";
        const citations = normalizeCitations(assistantResult.citations, hasSearchTool);

        // 创建 artifacts
        const parts = await createArtifactsForChat({
          userId,
          conversationId,
          assistantResult,
        }).catch(() => [
          errorPart("ARTIFACT_UNAVAILABLE", "回答已生成，但画像、计划或职业报告卡片暂未生成。"),
        ]);

        // 添加 citation 卡片
        if (citations.length > 0) {
          parts.push({
            type: "citations",
            items: citations.map((c) => ({
              title: c.title,
              source: c.source,
              url: c.url,
              accessedAt: c.accessedAt,
              label: c.label,
            })),
          } as any);
        }

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

        // 非阻塞：检查是否需要触发摘要
        triggerSummaryIfNeeded(conversationId).catch(() => {});

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

// ── 辅助：加载真实 UserProfile ──────────────────────

interface RealProfileFields {
  educationStage: string | null;
  major: string | null;
  targetRole: string | null;
  targetRoleLabel: string | null;
  weeklyAvailableHours: number | null;
  learningPreference: string;
  experienceSummary: string;
  constraints: string;
  interestTags: string;
  memoryEnabled: boolean;
  version: number;
}

async function loadRealUserProfile(userId: string): Promise<RealProfileFields | null> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();
    const row = await db.userProfile.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      educationStage: row.educationStage,
      major: row.major,
      targetRole: row.targetRole,
      targetRoleLabel: row.targetRoleLabel,
      weeklyAvailableHours: row.weeklyAvailableHours,
      learningPreference: row.learningPreference,
      experienceSummary: row.experienceSummary,
      constraints: row.constraints,
      interestTags: row.interestTags,
      memoryEnabled: row.memoryEnabled,
      version: row.version,
    };
  } catch {
    return null;
  }
}

// ── 辅助：加载已回答的问题 keys ────────────────────

async function loadAnsweredQuestionKeys(conversationId: string): Promise<string[]> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();
    const rows = await db.questionLedger.findMany({
      where: { conversationId, status: "answered" },
      select: { normalizedQuestionKey: true },
    });
    return rows.map((r) => r.normalizedQuestionKey);
  } catch {
    return [];
  }
}

// ── 辅助：安全解析 JSON 数组 ──────────────────────────

function parseJsonArray(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

// ── 辅助：加载上下文记忆 ──────────────────────────

async function loadContextMemories(userId: string): Promise<Array<{ id: string; kind: string; content: string }>> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();

    // 检查用户是否启用了记忆功能
    const profile = await db.userProfile.findUnique({ where: { userId }, select: { memoryEnabled: true } });
    if (!profile?.memoryEnabled) return [];

    const now = new Date();
    const rows = await db.memoryItem.findMany({
      where: {
        userId,
        status: "confirmed",
        scope: "career",
        sensitivity: "normal",
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return rows.map((r) => ({ id: r.id, kind: r.kind, content: r.content }));
  } catch {
    return [];
  }
}

// ── 辅助：加载活跃计划 ────────────────────────────

async function loadActivePlan(userId: string): Promise<{ id: string; targetRole: string; summary: string } | null> {
  try {
    const { getPrisma } = await import("@/lib/prisma");
    const db = getPrisma();
    const plan = await db.careerPlan.findFirst({
      where: { userId, status: "active" },
      orderBy: { version: "desc" },
    });
    if (!plan) return null;
    return { id: plan.id, targetRole: plan.targetRole, summary: plan.content ?? "" };
  } catch {
    return null;
  }
}

// ── 辅助：处理 Agent Operations ────────────────────

async function processAgentOperations(
  userId: string,
  conversationId: string,
  sourceMessageId: string,
  userMessage: string,
  operations: AgentOperation[],
): Promise<void> {
  const profileMutation = createProfileMutationService();
  const memoryProposal = createMemoryProposalService();

  for (const op of operations) {
    try {
      if (op.type === "profile_patch") {
        const decision = await profileMutation.decide({
          userId,
          conversationId,
          patch: op.patch as any,
          sourceKind: op.sourceKind,
          confidence: op.confidence,
          evidenceExcerpt: op.evidenceExcerpt,
          reason: op.reason,
          sensitive: op.sensitive,
          userMessage,
        });

        if (decision.action === "auto_apply") {
          await profileMutation.applyPatch(userId, op.patch as any);
        } else if (decision.action === "pending_candidate") {
          await profileMutation.createCandidate({
            userId,
            conversationId,
            patch: op.patch as any,
            sourceKind: op.sourceKind,
            confidence: op.confidence,
            evidenceExcerpt: op.evidenceExcerpt,
            reason: decision.reason,
            sensitive: op.sensitive,
          });
        }
      }

      if (op.type === "memory_proposal") {
        await memoryProposal.processProposal({
          userId,
          conversationId,
          sourceMessageId,
          content: op.content,
          kind: op.kind,
          sourceKind: op.sourceKind,
          confidence: op.confidence,
          reason: op.reason,
          sensitivity: op.sensitive ? "sensitive" : "normal",
        });
      }

      if (op.type === "plan_draft") {
        // 持久化 Plan V2 draft → pending 状态
        try {
          const { getPrisma } = await import("@/lib/prisma");
          const db = getPrisma();
          // 获取当前最高版本号后自增
          const latest = await db.careerPlan.findFirst({
            where: { userId },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          const planData = op.plan as Record<string, unknown>;
          await db.careerPlan.create({
            data: {
              userId,
              targetRole: (planData.targetRole as any)?.key ?? "unknown",
              version: (latest?.version ?? 0) + 1,
              status: "pending",
              schemaVersion: 2,
              content: JSON.stringify(op.plan),
              targetRoleLabel: (planData.targetRole as any)?.label ?? null,
              years: "[]",
              quarters: "[]",
              months: "[]",
              currentMonthIndex: 0,
              assumptions: JSON.stringify((planData as any)?.assumptions ?? []),
              riskNotes: JSON.stringify((planData as any)?.riskNotes ?? []),
              generationMeta: JSON.stringify({
                triggeredBy: "chat",
                conversationId,
                source: "agent_operation",
              }),
            },
          });
        } catch { /* plan_draft 持久化失败不影响其他 */ }
      }

      if (op.type === "exploration_report") {
        // 持久化探索报告到 progressLog（careerExploration 表不存在，使用 progressLog）
        try {
          const { getPrisma } = await import("@/lib/prisma");
          const db = getPrisma();
          await db.progressLog.create({
            data: {
              userId,
              eventType: "exploration_report",
              title: "职业探索报告",
              summary: JSON.stringify(op.report).slice(0, 500),
              metadata: JSON.stringify({ conversationId, sourceMessageId }),
            },
          });
        } catch { /* exploration_report 持久化失败不影响其他 */ }
      }
    } catch {
      // 单个 operation 失败不影响其他
    }
  }
}

// ── 辅助：非阻塞触发摘要 ────────────────────────

async function triggerSummaryIfNeeded(conversationId: string): Promise<void> {
  try {
    const { isConversationSummaryEnabled } = await import("@/lib/env");
    if (!isConversationSummaryEnabled()) return;

    const { createSummaryService } = await import("./summary-service");
    const summarySvc = createSummaryService();
    const { should } = await summarySvc.shouldSummarize(conversationId);

    if (!should) return;

    // 异步触发摘要生成（不阻塞当前请求）
    // 完整实现需要调用百宝箱主 Agent，这里先标记待处理
    console.log(`[summary] conversation=${conversationId} summary pending`);
  } catch {
    // 摘要触发失败不影响主流程
  }
}
