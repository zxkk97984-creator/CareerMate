import { createChatService, type ChatService } from "./service";
import { streamChatWithTboxProgressive } from "@/lib/tbox/streaming";
import { parseTerminalAgentResponse } from "@/lib/tbox/structured-result";
import { getTboxConfig, isStatefulChatTurns, isAgentOperationsEnabled, isPlanV2WriteEnabled, isAgenticV2Enabled } from "@/lib/env";
import { writeSseEvent } from "./sse";
import { createTurnService, TurnServiceError } from "./turn-service";
import { buildAgentContext, trimRecentMessages } from "./context-builder";
import { parseConversationState } from "./conversation-state";
import { normalizeCitations, normalizeCitationsFromToolCalls, detectSearchToolCall } from "@/lib/tbox/citations";
import { createProfileMutationService } from "@/lib/profile/profile-mutation-service";
import { createMemoryProposalService } from "@/lib/memory/proposal-service";
import { convertV2ToV1Arrays } from "@/lib/plans/compatibility";
import { getPrisma } from "@/lib/prisma";
import type { TboxHistoryMessage } from "@/lib/tbox/types";
import type { AgentOperation } from "./agent-protocol";
import { buildAgenticV2BusinessData, type AgenticV2Interaction } from "./agentic-v2-context";
import { loadAgenticV2Snapshot } from "./agentic-v2-snapshot";
import { resolveBoundRemoteConversationId } from "./remote-conversation-binding";
import { parseAgentArtifactEnvelope } from "@/lib/agentic-v2/artifact-envelope";
import { ingestAgentArtifact } from "@/lib/agentic-v2/candidate-ingestion";
import { createAgentArtifactCandidateService } from "@/lib/agentic-v2/candidate-service";
import { agentArtifactCandidateRefPart } from "./artifacts";

// ── 类型 ──────────────────────────────────────────────────

export interface StreamingOptions {
  userId: string;
  conversationId: string;
  message: string;
  clientRequestId: string;
  actionId?: string;
  interaction?: AgenticV2Interaction;
  signal?: AbortSignal;
}

// ── 渐进式流：ReadableStream 模式 ───────────────────────────

export async function handleStreamRequest(
  options: StreamingOptions,
  service?: ChatService,
): Promise<Response> {
  const svc = service ?? createChatService();
  const config = getTboxConfig();

  if (isStatefulChatTurns()) {
    return handleStatefulStream(options, svc, config);
  }

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

  let beginResult: { kind: "new"; turn: { id: string; userMessageId: string; assistantMessageId: string } } | { kind: "replay"; turn: { assistantText: string; parts?: unknown[]; citations?: unknown[]; executionMeta?: Record<string, unknown>; userMessageId?: string; assistantMessageId?: string; remoteConversationId?: string } };
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

  // ── 重放路径：返回真实 messageId、parts、citations、meta ──
  if (beginResult.kind === "replay") {
    const rt = beginResult.turn;
    const stream = new ReadableStream({
      async start(controller) {
        writeSseEvent(controller, "context", {
          conversationId,
          userMessageId: rt.userMessageId ?? "",
          assistantMessageId: rt.assistantMessageId ?? "",
          intent: null,
          usedProfile: false,
          usedPlan: false,
          usedMemoryCount: 0,
          knowledgeSources: [],
        });
        writeSseEvent(controller, "delta", {
          messageId: rt.assistantMessageId ?? "",
          text: rt.assistantText,
        });
        // 重放 parts/citations
        const parts = rt.parts ?? [];
        for (const part of parts) {
          writeSseEvent(controller, "artifact", {
            messageId: rt.assistantMessageId ?? "",
            part,
          });
        }
        writeSseEvent(controller, "done", {
          messageId: rt.assistantMessageId ?? "",
          remoteConversationId: rt.remoteConversationId ?? null,
          status: "completed" as const,
          meta: rt.executionMeta ?? { source: "replay" },
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
  const agenticV2 = isAgenticV2Enabled();

  // 先尝试加载 V2 快照；失败则安全失败当前轮次
  let agenticSnapshot: Awaited<ReturnType<typeof loadAgenticV2Snapshot>> | null = null;
  if (agenticV2) {
    try {
      agenticSnapshot = await loadAgenticV2Snapshot({
        userId, conversationId, interaction: options.interaction,
      });
    } catch {
      await turnService.fail({
        turn: {
          id: turn.id, conversationId, userId, clientRequestId,
          userMessageId: turn.userMessageId,
          assistantMessageId: turn.assistantMessageId,
        },
        partialText: "",
        code: "SNAPSHOT_LOAD_FAILED",
      }).catch(() => {});
      return new Response(JSON.stringify({
        error: {
          code: "SNAPSHOT_LOAD_FAILED",
          message: "职业上下文加载失败，请稍后重试",
        },
      }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }

  const [convDetail, messages, memories, activePlan, answeredQuestions] = await Promise.all([
    svc.getConversation(conversationId, userId).catch(() => null),
    svc.getMessages(conversationId, userId, undefined, 24).catch(() => []),
    loadContextMemories(userId),
    loadActivePlan(userId),
    loadAnsweredQuestionKeys(conversationId),
  ]);

  const convState = parseConversationState(convDetail?.state ?? null);

  // 构建最近消息历史——排除当前轮次刚持久化的用户消息（避免重复）
  const recentMessages = messages
    .filter((m) => m.status === "completed" && m.content)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const trimmedHistory = trimRecentMessages(recentMessages);

  // 构建完整 AgentContext
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
      immediateActions: activePlan.immediateActions,
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

  // 默认 question_prefix 包含完整 AgentContext JSON（scope 裁剪由 buildAgentContext 处理）
  // business_data 模式直接将 agentContext 作为结构化 context 发送
  // TBOX_REUSE_REMOTE_CONVERSATION_ID=false 时不传远端 ID
  const existingRemoteId: string | undefined = (agenticV2 || config.reuseRemoteConversationId)
    ? resolveBoundRemoteConversationId(convDetail, {
      agentId: config.agentId,
      agentVersion: config.agentVersion,
    })
    : undefined;

  // 确定搜索策略：未知职业/薪资/时效问题 → required
  const searchPolicy = agenticV2 ? "off" : resolveSearchPolicy(message, agentContext);

  // 三种互斥上下文模式
  const transport = config.contextTransport;

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
          intent: null,
          usedProfile: agentContext.profile !== null,
          usedPlan: agentContext.activePlan !== null,
          usedMemoryCount: agentContext.memories.length,
          knowledgeSources: [],
        });

        // 按模式构建请求参数
        let question: string;
        let history: TboxHistoryMessage[] | undefined;
        let context: unknown;

        if (agenticV2) {
          question = message;
          context = agenticSnapshot
            ? buildAgenticV2BusinessData({
                interaction: options.interaction,
                ...agenticSnapshot,
              })
            : undefined;
          history = undefined;
        } else if (transport === "provider_history") {
          // provider_history: 发送原始问题 + 裁剪后的历史（排除本轮消息）
          question = message;
          history = buildProviderHistory(messages, turn.userMessageId);
        } else if (transport === "business_data") {
          // business_data: 原始问题 + 结构化 context
          question = message;
          context = agentContext;
          history = undefined;
        } else {
          // question_prefix: 增强问题嵌入完整上下文
          question = buildEnhancedQuestion(message, agentContext as unknown as Record<string, unknown>);
          history = undefined;
          context = undefined;
        }

        const aiResponse = await streamChatWithTboxProgressive(
          {
            question,
            userId,
            conversationId: existingRemoteId,
            history,
            context,
            searchPolicy,
          },
          { config, signal },
          (event) => {
            if (event.meta) finalMeta = event.meta;

            if (event.event === "message" && event.data.type === "delta") {
              fullContent += event.data.content;
              // Agentic V2：缓冲完整响应，不直接发送 delta（防止 CAREERMATE_ARTIFACT 泄露到前端气泡）
              if (!agenticV2) {
                writeSseEvent(controller, "delta", {
                  messageId: turn.assistantMessageId,
                  text: event.data.content,
                });
              }
            }

            if (event.event === "done") {
              remoteConversationId = event.data.conversationId;
            }
          },
        );
        finalMeta = aiResponse.meta as unknown as Record<string, unknown>;
        remoteConversationId = aiResponse.data.conversationId ?? remoteConversationId;

        // ── AgentResponse 解析（仅从显式 terminal structured 字段，绝不自 text 提取）──
        const agentResponseResult = parseTerminalAgentResponse(aiResponse.data);
        const agentResponse = (config.structuredMode !== "disabled")
          ? agentResponseResult.response
          : undefined;

        // 归一化 citations
        const toolCalls = aiResponse.data.toolCalls ?? [];
        const toolNames = new Set([
          ...toolCalls.map((tc) => tc.toolType),
          ...toolCalls.map((tc) => tc.tool).filter((t): t is string => typeof t === "string" && t.length > 0),
        ]);
        const hasSearchTool = detectSearchToolCall(toolNames);
        let citations = normalizeCitationsFromToolCalls(toolCalls);
        if (citations.length === 0) {
          citations = normalizeCitations(aiResponse.data.citations, hasSearchTool);
        }

        // 校验 AgentResponse.sourceRefs 与 citations 绑定
        const validatedSourceRefs = validateSourceRefs(agentResponse?.sourceRefs, toolCalls, citations);

        // ── 短事务 B：完成轮次（先 finalize 确保消息持久化，再执行 operations）──
        const parts: unknown[] = [];
        if (agentResponseResult.warnings.length > 0) {
          parts.push({ type: "error", code: "AGENT_RESPONSE_WARNINGS", message: agentResponseResult.warnings.join("; ").slice(0, 500) });
        }

        // 处理 AgentResponse.task/questions → 更新会话状态 + 发送 quick_actions
        if (agentResponse?.task || agentResponse?.questions?.length) {
          await applyAgentTaskState(conversationId, agentResponse, realProfile?.version ?? 1).catch(() => {});
          // 将 quick_actions 加入 parts 持久化（确保 replay 可用），并通过 artifact 事件发送
          const question = agentResponse?.questions?.[0];
          if (question?.actions?.length) {
            const qaPart = {
              type: "quick_actions" as const,
              questionId: question.id,
              actions: question.actions,
              status: "pending" as const,
            };
            parts.push(qaPart);
          }
        }

        // ── 执行 Agent Operations（先于 finalize，结果持久化到 parts）──
        const metaSource = (finalMeta as Record<string, unknown>)?.source as string | undefined;
        const metaDegraded = (finalMeta as Record<string, unknown>)?.degraded as boolean | undefined;
        const isMockSource = metaSource === "local-mock";
        const safeForOperations = !agenticV2
          && isAgentOperationsEnabled()
          && !metaDegraded
          && config.structuredMode !== "disabled"
          && agentContext.scope !== "general_minimal"
          && agentContext.scope !== "privacy"
          && (config.mode === "api" ? metaSource !== "local-mock" : isMockSource);

        if (safeForOperations && agentResponse?.operations && agentResponse.operations.length > 0) {
          const allowedOps = agentResponse.operations.filter((op) => {
            if (op.type === "plan_draft" && !isPlanV2WriteEnabled()) return false;
            return true;
          });
          if (allowedOps.length > 0) {
            const operationResults = await executeAgentOperations(
              userId, conversationId, clientRequestId, turn.assistantMessageId, message, allowedOps,
            );
            for (const ref of operationResults) {
              parts.push(ref);
            }
          }
        }

        // 添加 citation 卡片（截断到 schema max=12，去重）
        if (citations.length > 0) {
          const seen = new Set<string>();
          const deduped: typeof citations = [];
          for (const c of citations) {
            const key = `${c.title}|${c.source}`;
            if (!seen.has(key)) { seen.add(key); deduped.push(c); }
          }
          const MAX_CITATIONS = 12;
          const trimmed = deduped.slice(0, MAX_CITATIONS);
          parts.push({
            type: "citations",
            items: trimmed.map((c) => ({
              title: c.title,
              source: c.source,
              url: c.url,
              accessedAt: c.accessedAt,
              label: c.label,
            })),
          });
        }

        // ── Agentic V2 信封解析：仅在流完成后解析精确标签 ──
        const envelope = agenticV2
          ? parseAgentArtifactEnvelope(aiResponse.data.text || fullContent)
          : { displayText: fullContent, warnings: [] as string[] };

        const assistantText = agenticV2 ? envelope.displayText : fullContent;

        // Agentic V2：解析完成后发送缓冲的正文（此时已剥离 CAREERMATE_ARTIFACT）
        if (agenticV2 && assistantText) {
          writeSseEvent(controller, "delta", {
            messageId: turn.assistantMessageId,
            text: assistantText,
          });
        }

        // 摄入候选（仅当有有效 artifact 时）
        let candidateIngestionError: string | null = null;
        if (agenticV2 && envelope.artifact) {
          try {
            const candidateService = createAgentArtifactCandidateService();
            const ingestionResult = await ingestAgentArtifact(
              {
                userId,
                conversationId,
                sessionId: remoteConversationId ?? conversationId,
                clientRequestId,
                artifact: envelope.artifact,
              },
              candidateService,
            );
            if (ingestionResult.candidate) {
              parts.push(agentArtifactCandidateRefPart(ingestionResult.candidate));
            }
            // 合并信封警告和摄入警告
            for (const w of [...envelope.warnings, ...ingestionResult.warnings]) {
              if (!agentResponseResult.warnings.includes(w)) {
                agentResponseResult.warnings.push(w);
              }
            }
          } catch (err) {
            // 候选摄入失败不能静默吞掉——记录错误并追加到 warnings
            candidateIngestionError = err instanceof Error ? err.message : "候选摄入失败";
            agentResponseResult.warnings.push(`CANDIDATE_INGESTION_FAILED: ${candidateIngestionError}`);
          }
        } else if (envelope.warnings.length > 0) {
          // 信封解析有警告但无候选时合并警告
          for (const w of envelope.warnings) {
            if (!agentResponseResult.warnings.includes(w)) {
              agentResponseResult.warnings.push(w);
            }
          }
        }

        // ── 短事务 B：完成轮次（parts 已含 operations + citations + candidate ref）──
        await turnService.finalize({
          turn: {
            id: turn.id,
            conversationId,
            userId,
            clientRequestId,
            userMessageId: turn.userMessageId,
            assistantMessageId: turn.assistantMessageId,
          },
          assistantText,
          agentResponse: agentResponse ?? undefined,
          citations: validatedSourceRefs.map((r) => ({ title: r.kind, source: `ref_${r.citationIndex}` })),
          parts,
          remoteConversationId: remoteConversationId ?? undefined,
          remoteBinding: remoteConversationId ? {
            agentId: config.agentId,
            agentVersion: config.agentVersion,
          } : undefined,
          executionMeta: finalMeta ?? { requestedMode: config.mode, actualMode: config.mode, degraded: false, source: "tbox-api" },
          warnings: agentResponseResult.warnings ?? [],
        });

        // 发送 artifact 事件
        for (const part of parts) {
          writeSseEvent(controller, "artifact", {
            messageId: turn.assistantMessageId,
            part,
          });
        }

        // 非阻塞触发摘要
        triggerSummaryIfNeeded(conversationId).catch(() => {});

        // done 事件必须携带最终 warnings
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
          warnings: agentResponseResult.warnings.length > 0 ? agentResponseResult.warnings : undefined,
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "未知错误";
        const errorCode = errMessage === "aborted" ? "ABORTED" : "TBOX_UNAVAILABLE";

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
        }).catch(() => {});

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
  const { userId, conversationId, message, signal, clientRequestId } = options;
  const agenticV2 = isAgenticV2Enabled();

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

  await svc.updateConversationTitleFromFirstMessage(
    conversationId, userId, message,
  ).catch(() => {});

  const existingConversation = (agenticV2 || config.reuseRemoteConversationId)
    ? await svc.getConversation(conversationId, userId).catch(() => null)
    : null;
  const existingRemoteId = resolveBoundRemoteConversationId(existingConversation, {
    agentId: config.agentId,
    agentVersion: config.agentVersion,
  });

  // 在 Agentic V2 路径下加载消毒后的快照（失败则安全失败）
  let legacySnapshot: Awaited<ReturnType<typeof loadAgenticV2Snapshot>> | null = null;
  if (agenticV2) {
    try {
      legacySnapshot = await loadAgenticV2Snapshot({ userId, conversationId, interaction: options.interaction });
    } catch {
      return new Response(JSON.stringify({
        error: { code: "SNAPSHOT_LOAD_FAILED", message: "快照加载失败" },
      }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      let remoteConversationId: string | null = null;
      let finalMeta: Record<string, unknown> | null = null;

      try {
        writeSseEvent(controller, "context", {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          intent: null,
          usedProfile: false,
          usedPlan: false,
          usedMemoryCount: 0,
          knowledgeSources: [],
        });

        const aiResponse = await streamChatWithTboxProgressive(
          {
            question: message,
            userId,
            conversationId: existingRemoteId,
            context: agenticV2 && legacySnapshot
              ? buildAgenticV2BusinessData({
                  interaction: options.interaction,
                  ...legacySnapshot,
                })
              : undefined,
            searchPolicy: agenticV2 ? "off" : undefined,
          },
          { config, signal },
          (event) => {
            if (event.meta) finalMeta = event.meta;
            if (event.event === "message" && event.data.type === "delta") {
              fullContent += event.data.content;
              // Agentic V2：缓冲完整响应，不直接发送 delta（防止 CAREERMATE_ARTIFACT 泄露）
              if (!agenticV2) {
                writeSseEvent(controller, "delta", {
                  messageId: assistantMsg.id,
                  text: event.data.content,
                });
              }
            }
            if (event.event === "done") {
              remoteConversationId = event.data.conversationId;
            }
          },
        );
        finalMeta = aiResponse.meta as unknown as Record<string, unknown>;
        remoteConversationId = aiResponse.data.conversationId ?? remoteConversationId;

        // ── Agentic V2 信封解析（legacy 路径也共享） ──
        const legacyEnvelope = agenticV2
          ? parseAgentArtifactEnvelope(aiResponse.data.text || fullContent)
          : { displayText: fullContent, warnings: [] as string[] };
        const legacyAssistantText = agenticV2 ? legacyEnvelope.displayText : fullContent;

        // Agentic V2：解析完成后发送缓冲的正文（已剥离 CAREERMATE_ARTIFACT）
        if (agenticV2 && legacyAssistantText) {
          writeSseEvent(controller, "delta", {
            messageId: assistantMsg.id,
            text: legacyAssistantText,
          });
        }

        // 旧路径：只保留正文，不执行业务写入
        // AgentResponse 解析仅用于结构化模式下的 operations
        let operations: AgentOperation[] = [];
        if (!agenticV2 && config.structuredMode !== "disabled" && isAgentOperationsEnabled()) {
          const ar = parseTerminalAgentResponse(aiResponse.data);
          operations = ar.response?.operations ?? [];
        }

        // finalize 消息
        const parts: unknown[] = [];
        const legacyWarnings: string[] = [...legacyEnvelope.warnings];

        // 摄入候选（V2 信封协议）
        if (agenticV2 && legacyEnvelope.artifact) {
          try {
            const candidateService = createAgentArtifactCandidateService();
            const ingestionResult = await ingestAgentArtifact(
              {
                userId,
                conversationId,
                sessionId: remoteConversationId ?? conversationId,
                clientRequestId,
                artifact: legacyEnvelope.artifact,
              },
              candidateService,
            );
            if (ingestionResult.candidate) {
              parts.push(agentArtifactCandidateRefPart(ingestionResult.candidate));
            }
            for (const w of ingestionResult.warnings) {
              if (!legacyWarnings.includes(w)) legacyWarnings.push(w);
            }
          } catch (err) {
            // 候选摄入失败不能静默吞掉
            legacyWarnings.push(`CANDIDATE_INGESTION_FAILED: ${err instanceof Error ? err.message : "候选摄入失败"}`);
          }
        }

        await svc.updateMessage(assistantMsg.id, {
          content: legacyAssistantText,
          parts: JSON.stringify(parts),
          status: "completed",
          executionMeta: JSON.stringify(finalMeta ?? {}),
          contextMeta: JSON.stringify({}),
        });

        if (remoteConversationId) {
          await svc.touchConversation(conversationId, remoteConversationId, {
            agentId: config.agentId,
            agentVersion: config.agentVersion,
          }).catch(() => {});
        }

        // 执行 operations
        if (operations.length > 0) {
          const opRefs = await executeAgentOperations(userId, conversationId, clientRequestId, assistantMsg.id, message, operations);
          for (const ref of opRefs) {
            writeSseEvent(controller, "artifact", { messageId: assistantMsg.id, part: ref });
          }
        }

        writeSseEvent(controller, "done", {
          messageId: assistantMsg.id,
          remoteConversationId,
          status: "completed" as const,
          meta: finalMeta ?? { source: "tbox-api" },
          warnings: legacyWarnings.length > 0 ? legacyWarnings : undefined,
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "未知错误";
        const errorCode = errMessage === "aborted" ? "ABORTED" : "TBOX_UNAVAILABLE";

        await svc.updateMessage(assistantMsg.id, {
          content: fullContent || "",
          parts: JSON.stringify([{ type: "error", code: errorCode, message: "连接失败，可稍后重试。" }]),
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
        try { controller.close(); } catch { /* 已关闭 */ }
      }
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

// ── 辅助：构建增强问题（question_prefix 模式）──

function buildEnhancedQuestion(userMessage: string, ctx: Record<string, unknown>): string {
  const conv = ctx.conversation as Record<string, unknown> | undefined;
  // 12k 总预算注入完整脱敏 AgentContext（含 recentMessages、summary、memories、plan、ledger）
  const recentMsgs = (conv?.recentMessages as Array<{ role: string; content: string }> | undefined) ?? [];
  const contextObj: Record<string, unknown> = {
    profile: ctx.profile,
    profileVersion: ctx.profileVersion,
    activePlan: ctx.activePlan,
    memories: ctx.memories,
    conversation: {
      currentTask: conv?.currentTask,
      awaitingQuestion: conv?.awaitingQuestion,
      answeredQuestionKeys: conv?.answeredQuestionKeys,
      summary: conv?.summary,
      contextVersion: conv?.contextVersion,
      recentMessages: recentMsgs.slice(-6).map((m) => ({ role: m.role, text: m.content.slice(0, 300) })),
    },
    policy: ctx.policy,
    searchPolicy: ctx.searchPolicy,
    scope: ctx.scope,
  };
  const contextStr = JSON.stringify(contextObj);
  // 保证 JSON 完整性：在 maxContext 字符内找到最后一个完整的 } 或 ]
  const maxContext = 10_000;
  let trimmedContext = contextStr;
  if (contextStr.length > maxContext) {
    trimmedContext = contextStr.slice(0, maxContext - 3);
    // 回退到最后一个 } 保持 JSON 闭合
    const lastBrace = trimmedContext.lastIndexOf("}");
    if (lastBrace > maxContext / 2) trimmedContext = trimmedContext.slice(0, lastBrace + 1);
  }
  return `你是 CareerMate 职业规划助手。以下是已授权用户上下文：\n${trimmedContext}\n\n用户原始问题：${userMessage}`;
}

// ── 构建 provider_history 模式的历史消息（排除本轮消息）──

function buildProviderHistory(
  messages: Array<{ id: string; role: string; content: string; status: string }>,
  excludeUserMsgId: string,
): TboxHistoryMessage[] {
  return messages
    .filter((m) => m.status === "completed" && m.content && m.id !== excludeUserMsgId)
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 800) }));
}

// ── 确定搜索策略 ─────────────────────────────────────

function resolveSearchPolicy(
  userMessage: string,
  ctx: { searchPolicy: string; scope: string },
): "off" | "allowed" | "required" {
  // 非职业 scope → off
  if (ctx.scope === "general_minimal" || ctx.scope === "privacy") return "off";
  // 显式联网请求、未知职业、薪资趋势等时效问题 → required
  const msg = userMessage.toLowerCase();
  if (/联网|搜索|查一下|最新|薪资|工资|趋势|招聘|行情|市场/.test(msg)) return "required";
  if (/介绍|了解|什么是|怎么样|前景/.test(msg) && /岗位|职业|工作/.test(msg)) return "required";
  return ctx.searchPolicy as "off" | "allowed" | "required";
}

// ── 辅助：校验 sourceRefs 与 citations 绑定 ──

function validateSourceRefs(
  sourceRefs: Array<{ citationIndex?: number; kind?: string }> | undefined,
  _toolCalls: unknown[],
  citations: unknown[],
): Array<{ citationIndex: number; kind: string }> {
  if (!sourceRefs || !Array.isArray(sourceRefs)) return [];
  const valid: Array<{ citationIndex: number; kind: string }> = [];
  for (const ref of sourceRefs) {
    const r = ref as Record<string, unknown>;
    const idx = typeof r.citationIndex === "number" ? r.citationIndex : -1;
    if (idx >= 0 && idx < citations.length) {
      valid.push({ citationIndex: idx, kind: (r.kind as string) ?? "ai_inference" });
    }
  }
  return valid;
}

// ── 辅助：应用 AgentResponse.task/questions 到会话状态 ──

async function applyAgentTaskState(
  conversationId: string,
  agentResponse: { task?: { kind: string; status: string; goal?: string }; questions?: Array<{ id: string; normalizedKey: string; text: string; profileField?: string; answerKind: string; actions?: Array<{ id: string; label: string; value: string }> }> },
  profileVersion: number,
): Promise<void> {
  try {
    const db = getPrisma();
    const conv = await db.chatConversation.findUnique({
      where: { id: conversationId },
      select: { state: true },
    });
    if (!conv) return;

    let state: Record<string, unknown>;
    try { state = JSON.parse(conv.state ?? "{}") as Record<string, unknown>; } catch { state = {}; }

    // 更新 currentTask
    if (agentResponse.task) {
      state.currentTask = agentResponse.task;
    }

    // 处理 questions —— 记录 asked，生成 quick_actions（含完整 schema 字段）
    const question = agentResponse.questions?.[0];
    if (question) {
      // 检查是否应该提问：已有 answered 记录则跳过
      const existing = await db.questionLedger.findFirst({
        where: { conversationId, normalizedQuestionKey: question.normalizedKey, status: "answered" },
      });
      if (!existing) {
        try {
          await db.questionLedger.upsert({
            where: {
              conversationId_normalizedQuestionKey_profileVersion: {
                conversationId,
                normalizedQuestionKey: question.normalizedKey,
                profileVersion,
              },
            },
            update: { questionText: question.text, status: "asked" },
            create: {
              conversationId,
              normalizedQuestionKey: question.normalizedKey,
              profileVersion,
              questionText: question.text,
              profileField: question.profileField ?? null,
              status: "asked",
              answerSummary: "",
            },
          });
        } catch { /* 唯一约束冲突等非关键错误 */ }

        // 写入完整 awaitingQuestion（含 id/answerKind/actions，通过下一轮 schema 校验）
        state.awaitingQuestion = {
          id: question.id,
          normalizedKey: question.normalizedKey,
          text: question.text,
          profileField: question.profileField ?? null,
          answerKind: question.answerKind,
          actions: question.actions ?? [],
          askedAt: new Date().toISOString(),
        };
      }
    }

    await db.chatConversation.update({
      where: { id: conversationId },
      data: { state: JSON.stringify(state) },
    });
  } catch {
    // 状态更新失败不影响主流程
  }
}

// ── 辅助：执行 Agent Operations（幂等 outbox 模式）──

interface OperationResult {
  type: string;
  [key: string]: unknown;
}

async function executeAgentOperations(
  userId: string,
  conversationId: string,
  clientRequestId: string,
  sourceMessageId: string,
  userMessage: string,
  operations: AgentOperation[],
): Promise<OperationResult[]> {
  const profileMutation = createProfileMutationService();
  const memoryProposal = createMemoryProposalService();
  const db = getPrisma();
  const results: OperationResult[] = [];

  for (const op of operations) {
    let opResult: OperationResult | null = null;
    let opError: string | null = null;
    try {
      // ── 原子 claim：唯一键保证并发安全 ──
      const claim = await atomicClaimOperation(db, userId, conversationId, clientRequestId, op.id, op.type);
      if (!claim.claimed) {
        // 已完成 → 返回缓存结果
        opResult = claim.result;
        results.push(claim.result);
        continue;
      }
      // claimed → 执行副作用

      if (op.type === "profile_patch") {
        const decision = await profileMutation.decide({
          userId, conversationId,
          patch: op.patch as any,
          sourceKind: op.sourceKind,
          confidence: op.confidence,
          evidenceExcerpt: op.evidenceExcerpt,
          reason: op.reason,
          sensitive: op.sensitive,
          userMessage,
        });

        if (decision.action === "auto_apply") {
          const r = await profileMutation.applyPatch(userId, op.patch as any);
          opResult = { type: "profile_applied", version: r.version, operationId: op.id };
          results.push(opResult);
        } else if (decision.action === "pending_candidate") {
          // 逐字段创建候选——每个字段独立可确认
          const patch = op.patch as Record<string, unknown>;
          for (const [field, value] of Object.entries(patch)) {
            if (value === undefined || value === null) continue;
            try {
              const r = await profileMutation.createCandidate({
                userId, conversationId,
                patch: { [field]: value } as any,
                sourceKind: op.sourceKind,
                confidence: op.confidence,
                evidenceExcerpt: op.evidenceExcerpt,
                reason: decision.reason,
                sensitive: op.sensitive,
                operationId: op.id,
              });
              opResult = { type: "profile_candidate_ref", candidateId: r.candidateId, operationId: op.id };
              results.push(opResult);
            } catch { /* 单字段候选创建失败不阻止其他字段 */ }
          }
        }
      }

      if (op.type === "memory_proposal") {
        try {
          const r = await memoryProposal.processProposal({
            userId, conversationId, sourceMessageId,
            content: op.content, kind: op.kind,
            sourceKind: op.sourceKind, confidence: op.confidence,
            reason: op.reason,
            sensitivity: op.sensitive ? "sensitive" : "normal",
            operationId: op.id,
          });
          if (r.action !== "rejected") {
            opResult = { type: "memory_ref", memoryId: r.memoryId, status: r.action, operationId: op.id };
            results.push(opResult);
          }
        } catch (e) {
          opError = (e as Error).message.slice(0, 200);
          results.push({ type: "error", code: "MEMORY_PROPOSAL_FAILED", message: opError! });
        }
      }

      if (op.type === "plan_draft") {
        try {
          const latest = await db.careerPlan.findFirst({
            where: { userId }, orderBy: { version: "desc" }, select: { version: true },
          });
          const planData = op.plan as Record<string, unknown>;
          const targetRole = (planData.targetRole as Record<string, unknown>) ?? {};
          // 将 V2 phases 转换为 V1 years/quarters/months 格式用于渲染
          const v2plan = op.plan as Parameters<typeof convertV2ToV1Arrays>[0];
          const v1Arrays = convertV2ToV1Arrays(v2plan);
          const created = await db.careerPlan.create({
            data: {
              userId,
              targetRole: (targetRole.key as string) ?? "unknown",
              version: (latest?.version ?? 0) + 1,
              status: "pending",
              schemaVersion: 2,
              content: JSON.stringify(op.plan),
              targetRoleLabel: (targetRole.label as string) ?? null,
              years: JSON.stringify(v1Arrays.years),
              quarters: JSON.stringify(v1Arrays.quarters),
              months: JSON.stringify(v1Arrays.months),
              currentMonthIndex: v1Arrays.currentMonthIndex,
              assumptions: JSON.stringify((planData.assumptions as unknown[]) ?? []),
              riskNotes: JSON.stringify((planData.riskNotes as unknown[]) ?? []),
              generationMeta: JSON.stringify({ triggeredBy: "chat", conversationId, source: "agent_operation", operationId: op.id }),
            },
          });
          opResult = { type: "plan_ref", planId: created.id, version: created.version, operationId: op.id };
          results.push(opResult);
        } catch (e) {
          opError = (e as Error).message.slice(0, 200);
          results.push({ type: "error", code: "PLAN_DRAFT_FAILED", message: opError! });
        }
      }

      if (op.type === "exploration_report") {
        try {
          const report = op.report as Record<string, unknown>;
          const created = await db.careerExplorationReport.create({
            data: {
              userId, conversationId,
              roleName: (report.roleName as string) ?? "未知岗位",
              status: "exploratory",
              content: JSON.stringify(report),
              sources: JSON.stringify((report.sources as unknown[]) ?? []),
              executionMeta: JSON.stringify({ source: "agent_operation", sourceMessageId, operationId: op.id }),
            },
          });
          opResult = { type: "exploration_report_ref", reportId: created.id, operationId: op.id };
          results.push(opResult);
        } catch (e) {
          opError = (e as Error).message.slice(0, 200);
          results.push({ type: "error", code: "REPORT_CREATE_FAILED", message: opError! });
        }
      }
    } catch (e) {
      opError = (e as Error).message.slice(0, 200);
      results.push({ type: "error", code: "OPERATION_FAILED", message: opError });
    }
    // 原子 finalize
    await finalizeOperation(db, userId, conversationId, clientRequestId, op.id, opResult, opError);
  }

  return results;
}

/**
 * 原子 claim：通过唯一键 (userId+conversationId+clientRequestId+operationId)
 * 尝试 create → 成功表示获得执行权；失败(唯一约束冲突)表示已被 claim。
 * 返回 { claimed: true } 表示需要执行副作用，{ claimed: false, result } 表示已有结果。
 */
async function atomicClaimOperation(
  db: ReturnType<typeof getPrisma>,
  userId: string,
  conversationId: string,
  clientRequestId: string,
  operationId: string,
  opType: string,
): Promise<{ claimed: true } | { claimed: false; result: OperationResult }> {
  try {
    // 原子 create——唯一约束保证只有一个请求能成功
    await db.operationExecution.create({
      data: { userId, conversationId, clientRequestId, operationId, opType, status: "pending", result: "{}" },
    });
    return { claimed: true };
  } catch {
    // 唯一约束冲突——已被（自己或并发请求）claim
    const existing = await db.operationExecution.findFirst({
      where: { userId, conversationId, clientRequestId, operationId },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.status === "completed") {
      try { return { claimed: false, result: JSON.parse(existing.result) as OperationResult }; } catch { /* fall through */ }
    }
    // pending 或 failed → 等待重试时重新执行
    return { claimed: true };
  }
}

async function finalizeOperation(
  db: ReturnType<typeof getPrisma>,
  userId: string,
  conversationId: string,
  clientRequestId: string,
  operationId: string,
  result: OperationResult | null,
  error: string | null,
): Promise<void> {
  try {
    await db.operationExecution.updateMany({
      where: { userId, conversationId, clientRequestId, operationId },
      data: {
        status: error ? "failed" : "completed",
        result: JSON.stringify(result ?? { error }),
      },
    });
  } catch { /* 非关键 */ }
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
    const db = getPrisma();
    const profile = await db.userProfile.findUnique({ where: { userId }, select: { memoryEnabled: true } });
    if (!profile?.memoryEnabled) return [];

    const now = new Date();
    const rows = await db.memoryItem.findMany({
      where: {
        userId, status: "confirmed", scope: "career", sensitivity: "normal",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
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

async function loadActivePlan(userId: string): Promise<{ id: string; targetRole: string; summary: string; immediateActions: string[] } | null> {
  try {
    const db = getPrisma();
    const plan = await db.careerPlan.findFirst({
      where: { userId, status: "active" },
      orderBy: { version: "desc" },
    });
    if (!plan) return null;
    // V2 计划：解析 content 提取 summary 和 immediateActions
    if ((plan.schemaVersion ?? 1) >= 2 && plan.content) {
      try {
        const v2 = JSON.parse(plan.content);
        const iaList = (v2.immediateActions as Array<{ title: string }> | undefined) ?? [];
        return {
          id: plan.id,
          targetRole: plan.targetRole,
          summary: (v2.summary as string) ?? (v2.title as string) ?? "",
          immediateActions: iaList.map((a) => a.title),
        };
      } catch { /* 解析失败用 content 原文 */ }
    }
    return { id: plan.id, targetRole: plan.targetRole, summary: plan.content ?? "", immediateActions: [] };
  } catch {
    return null;
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

    // 通过 TBox Agent 生成摘要
    await generateSummary(conversationId, summarySvc);
  } catch {
    // 摘要失败不影响主流程
  }
}

async function generateSummary(
  conversationId: string,
  summarySvc: ReturnType<typeof import("./summary-service").createSummaryService>,
): Promise<void> {
  try {
    const db = getPrisma();
    // 获取需要摘要的消息（user+assistant，时间顺序）
    const messages = await db.chatMessage.findMany({
      where: { conversationId, status: "completed" },
      orderBy: { createdAt: "asc" },
      take: 48, // 24 对 user+assistant
      select: { id: true, role: true, content: true },
    });
    if (messages.length === 0) return;

    const lastMessageId = messages[messages.length - 1].id;
    const conversationText = messages.map((m) => `[${m.role === "user" ? "用户" : "助手"}] ${m.content.slice(0, 500)}`).join("\n");

    // 通过 TBox 生成摘要（使用本地模型降级）
    const summaryPrompt = `请根据以下对话内容生成结构化摘要（必须包含 schemaVersion=1）：\n${conversationText.slice(0, 8000)}\n\n返回格式：{"schemaVersion":1,"factsMentioned":[],"decisions":[],"openQuestions":[],"taskProgress":[]}`;

    try {
      const { streamChatWithTbox } = await import("@/lib/tbox/streaming");
      const config = getTboxConfig();
      const result = await streamChatWithTbox(
        { question: summaryPrompt, userId: "summary", conversationId: undefined, searchPolicy: "off" },
        { config },
      );
      const text = result.data.events
        .filter((e) => e.event === "message")
        .map((e) => (e.data as any).content as string)
        .join("");

      // 提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        await summarySvc.saveSummary(conversationId, raw, lastMessageId);
      }
    } catch {
      // TBox 摘要失败，保留旧摘要
    }
  } catch {
    // 摘要生成失败不影响主流程
  }
}
