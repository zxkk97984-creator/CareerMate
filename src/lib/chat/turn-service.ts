import { getPrisma } from "@/lib/prisma";
import type { AgentResponse } from "./agent-protocol";
import type { CitationObservation } from "../tbox/probe-judge";
import type { ConversationState } from "./conversation-state";
import { normalizeQuestionKey } from "./question-ledger";

// ── 轮次状态 ────────────────────────────────────

export interface ClaimedTurn {
  id: string;
  conversationId: string;
  userId: string;
  clientRequestId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export interface PersistedTurn {
  assistantText: string;
  agentResponse?: AgentResponse;
  citations: CitationObservation[];
  remoteConversationId?: string;
  warnings: string[];
}

export interface FinalizedTurn extends PersistedTurn {
  turnId: string;
}

export interface TurnBeginInput {
  userId: string;
  conversationId: string;
  message: string;
  clientRequestId: string;
  actionId?: string;
  /** 当前 UserProfile.version，用于 QuestionLedger 记录 */
  profileVersion?: number;
}

export interface TurnFinalizeInput {
  turn: ClaimedTurn;
  assistantText: string;
  agentResponse?: AgentResponse;
  citations: CitationObservation[];
  parts: unknown[];
  remoteConversationId?: string;
  executionMeta: Record<string, unknown>;
  warnings: string[];
}

export interface TurnFailInput {
  turn: ClaimedTurn;
  partialText: string;
  code: string;
  executionMeta?: Record<string, unknown>;
}

// ── 锁超时（毫秒）────────────────────────────────

const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 分钟

// ── 接口 ────────────────────────────────────────

export interface ChatTurnService {
  begin(input: TurnBeginInput): Promise<
    { kind: "new"; turn: ClaimedTurn } | { kind: "replay"; turn: PersistedTurn }
  >;
  finalize(input: TurnFinalizeInput): Promise<FinalizedTurn>;
  fail(input: TurnFailInput): Promise<void>;
}

// ── 辅助：生成轮次 ID ───────────────────────────

function generateTurnId(): string {
  // 使用时间戳+随机数的简单 ID 生成（不依赖外部库）
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `turn_${ts}_${rand}`;
}

// ── 辅助：区分快捷动作与用户手输 ──────────────

function resolveActionAnswer(
  actionId: string | undefined,
  awaiting: { id: string; text: string; actions?: Array<{ id: string; label: string; value: string }> } | null,
  userMessage: string,
): string {
  // 无 actionId → 用户自由文本输入
  if (!actionId) return userMessage;
  // 有 actionId 但无 awaiting → 客户端状态过期
  if (!awaiting) {
    throw new TurnServiceError(
      "快捷动作已过期，请重新发送消息",
      "ACTION_EXPIRED",
      409,
    );
  }
  // actionId 必须匹配当前 awaitingQuestion 的某个 action
  const actions = awaiting.actions ?? [];
  const matched = actions.find((a) => a.id === actionId);
  if (matched) return matched.value; // 快捷动作 → 使用 action value
  // actionId 不匹配任何可用动作 → 非法请求
  throw new TurnServiceError(
    "快捷动作不匹配当前可用选项",
    "INVALID_ACTION_ID",
    400,
  );
}

// ── 辅助：回答当前等待的问题 ─────────────────────

async function answerAwaitingQuestion(
  tx: any, // Prisma 事务客户端
  conversationId: string,
  state: ConversationState,
  userMessage: string,
  profileVersion: number,
): Promise<{ newState: ConversationState; updated: boolean }> {
  const awaiting = state.awaitingQuestion;
  if (!awaiting) return { newState: state, updated: false };

  const key = normalizeQuestionKey(awaiting.normalizedKey);
  if (!key) return { newState: state, updated: false };

  // 使用传入的 tx（事务内），避免全局 getPrisma 导致 SQLite 锁冲突
  await tx.questionLedger.upsert({
    where: {
      conversationId_normalizedQuestionKey_profileVersion: {
        conversationId,
        normalizedQuestionKey: key,
        profileVersion,
      },
    },
    update: {
      status: "answered",
      answerSummary: userMessage.slice(0, 500),
      answeredAt: new Date(),
    },
    create: {
      conversationId,
      normalizedQuestionKey: key,
      profileVersion,
      questionText: awaiting.text,
      profileField: awaiting.profileField ?? null,
      status: "answered",
      answerSummary: userMessage.slice(0, 500),
      answeredAt: new Date(),
    },
  });

  // 更新会话状态：清除 waiting question，更新任务回答
  const newState: ConversationState = {
    ...state,
    awaitingQuestion: null,
    currentTask: {
      ...state.currentTask,
      answers: {
        ...state.currentTask.answers,
        [awaiting.normalizedKey]: userMessage,
      },
    },
  };

  return { newState, updated: true };
}

// ── 实现 ────────────────────────────────────────

export function createTurnService(): ChatTurnService {
  const db = getPrisma();

  return {
    // ── 短事务 A：认领轮次 ──────────────────────────
    async begin(input) {
      const { userId, conversationId, message, clientRequestId } = input;

      // 使用事务确保原子性
      const result = await db.$transaction(async (tx) => {
        // 1. 校验会话归属
        const conv = await tx.chatConversation.findFirst({
          where: { id: conversationId, userId, status: { not: "deleted" } },
        });
        if (!conv) throw new TurnServiceError("会话不存在", "NOT_FOUND", 404);

        // 2. 幂等检查：同一 clientRequestId 是否已有用户消息
        const existingUserMsg = await tx.chatMessage.findFirst({
          where: { conversationId, clientRequestId, role: "user" },
        });

        if (existingUserMsg) {
          // 查找对应的助手消息
          const existingAssistantMsg = await tx.chatMessage.findFirst({
            where: { conversationId, turnId: existingUserMsg.turnId ?? undefined, role: "assistant" },
          });

          if (existingAssistantMsg && existingAssistantMsg.status === "completed") {
            // 已完成 → 完整重放
            let parsedParts: unknown[] = [];
            try { parsedParts = JSON.parse(existingAssistantMsg.parts ?? "[]"); } catch { /* ignore */ }
            let parsedExecution: Record<string, unknown> = {};
            try { parsedExecution = JSON.parse(existingAssistantMsg.executionMeta ?? "{}"); } catch { /* ignore */ }

            return {
              kind: "replay" as const,
              turn: {
                assistantText: existingAssistantMsg.content,
                parts: parsedParts,
                citations: [],
                remoteConversationId: conv.remoteConversationId ?? undefined,
                warnings: [],
                executionMeta: parsedExecution,
                userMessageId: existingUserMsg.id,
                assistantMessageId: existingAssistantMsg.id,
              } satisfies PersistedTurn & { parts?: unknown[]; executionMeta?: Record<string, unknown>; userMessageId?: string; assistantMessageId?: string },
            };
          }

          if (existingAssistantMsg && existingAssistantMsg.status === "streaming") {
            throw new TurnServiceError(
              "当前回复仍在生成，请稍候",
              "TURN_IN_PROGRESS",
              409,
            );
          }

          // 助手消息失败 → 允许重试，删除旧 user+assistant 消息对避免唯一约束冲突
          if (existingAssistantMsg) {
            await tx.chatMessage.delete({ where: { id: existingAssistantMsg.id } });
          }
          // 删除旧 user 消息，以便用同一个 clientRequestId 重新插入
          await tx.chatMessage.delete({ where: { id: existingUserMsg.id } });
        }

        // 3. 原子认领锁：使用 updateMany
        const lockCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS);
        const claimResult = await tx.chatConversation.updateMany({
          where: {
            id: conversationId,
            OR: [
              { activeTurnId: null },
              { activeTurnStartedAt: { lt: lockCutoff } },
            ],
          },
          data: {
            activeTurnId: "claiming", // 临时占位，稍后更新
            activeTurnStartedAt: new Date(),
          },
        });

        if (claimResult.count === 0) {
          throw new TurnServiceError(
            "当前回复仍在生成，请稍候",
            "TURN_IN_PROGRESS",
            409,
          );
        }

        // 超时锁接管：将旧 streaming 占位消息标记为 interrupted/failed
        const oldActiveTurnId = conv.activeTurnId;
        if (oldActiveTurnId && oldActiveTurnId !== "claiming") {
          await tx.chatMessage.updateMany({
            where: { conversationId, turnId: oldActiveTurnId, status: "streaming" },
            data: { status: "interrupted", content: "" },
          });
        }

        // 4. 生成 turnId 并创建消息
        const turnId = generateTurnId();

        // 更新锁为真正的 turnId
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: { activeTurnId: turnId },
        });

        // 创建用户消息（completed）
        const userMsg = await tx.chatMessage.create({
          data: {
            conversationId,
            role: "user",
            content: message,
            status: "completed",
            turnId,
            clientRequestId,
          },
        });

        // 创建助手占位消息（streaming）
        const assistantMsg = await tx.chatMessage.create({
          data: {
            conversationId,
            role: "assistant",
            content: "",
            status: "streaming",
            turnId,
            clientRequestId,
          },
        });

        // 5. 回答当前 awaitingQuestion（如果存在）——校验 actionId
        const rawState = conv.state ?? "{}";
        let state: ConversationState;
        try {
          state = JSON.parse(rawState) as ConversationState;
          if (state.schemaVersion !== 1) {
            state = { schemaVersion: 1, currentTask: { kind: "idle", status: "idle", answers: {} }, awaitingQuestion: null };
          }
        } catch {
          state = { schemaVersion: 1, currentTask: { kind: "idle", status: "idle", answers: {} }, awaitingQuestion: null };
        }

        // 校验 actionId：手输1≠快捷动作
        const resolvedAnswer = resolveActionAnswer(input.actionId, state.awaitingQuestion, message);

        const { newState } = await answerAwaitingQuestion(tx, conversationId, state, resolvedAnswer, input.profileVersion ?? 1);

        // 更新 state
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: {
            state: JSON.stringify(newState),
            lastMessageAt: new Date(),
          },
        });

        // 6. 自动标题
        if (conv.title === "新对话") {
          const normalized = message.trim().replace(/\s+/g, " ");
          const newTitle = normalized.length > 22 ? `${normalized.slice(0, 22)}…` : normalized;
          await tx.chatConversation.update({
            where: { id: conversationId },
            data: { title: newTitle },
          });
        }

        return {
          kind: "new" as const,
          turn: {
            id: turnId,
            conversationId,
            userId,
            clientRequestId,
            userMessageId: userMsg.id,
            assistantMessageId: assistantMsg.id,
          } satisfies ClaimedTurn,
        };
      });

      return result;
    },

    // ── 短事务 B：完成轮次 ──────────────────────────
    async finalize(input) {
      const { turn, assistantText, agentResponse, citations, parts, remoteConversationId, executionMeta, warnings } = input;

      const result = await db.$transaction(async (tx) => {
        // 1. 再次确认 activeTurnId 匹配
        const conv = await tx.chatConversation.findUnique({
          where: { id: turn.conversationId },
        });

        if (!conv || conv.activeTurnId !== turn.id) {
          throw new TurnServiceError(
            "轮次已过期或被覆盖",
            "TURN_STALE",
            409,
          );
        }

        // 2. 持久化 parts（operation refs + citations）——刷新/replay 完整恢复
        const persistedParts = [...parts];
        if (warnings.length > 0) {
          persistedParts.push({ type: "error", code: "WARNINGS", message: warnings.join("; ").slice(0, 500) });
        }

        // 3. 更新助手消息为 completed
        await tx.chatMessage.update({
          where: { id: turn.assistantMessageId },
          data: {
            content: assistantText,
            parts: JSON.stringify(persistedParts),
            status: "completed",
            executionMeta: JSON.stringify(executionMeta),
            contextMeta: JSON.stringify({ warnings }),
          },
        });

        // 4. 更新会话：清除锁、更新远端 ID、递增 contextVersion
        const updateData: Record<string, unknown> = {
          activeTurnId: null,
          activeTurnStartedAt: null,
          contextVersion: (conv.contextVersion ?? 1) + 1,
          lastMessageAt: new Date(),
        };
        if (remoteConversationId) {
          updateData.remoteConversationId = remoteConversationId;
        }

        await tx.chatConversation.update({
          where: { id: turn.conversationId },
          data: updateData,
        });

        // 5. 处理 AgentResponse operations（如果 AGENT_OPERATIONS_V1 开启）
        // 注意：operation 的实际持久化由 artifact-service 处理，
        // TurnService 只负责消息完成和锁释放

        return {
          turnId: turn.id,
          assistantText,
          agentResponse,
          citations,
          remoteConversationId,
          warnings,
        } satisfies FinalizedTurn;
      });

      return result;
    },

    // ── 失败处理 ────────────────────────────────────
    async fail(input) {
      const { turn, partialText, code, executionMeta } = input;

      await db.$transaction(async (tx) => {
        // 确认 activeTurnId 匹配
        const conv = await tx.chatConversation.findUnique({
          where: { id: turn.conversationId },
        });

        if (!conv || conv.activeTurnId !== turn.id) {
          // 锁已被覆盖，只更新消息状态
          await tx.chatMessage.update({
            where: { id: turn.assistantMessageId },
            data: {
              content: partialText,
              parts: JSON.stringify([{
                type: "error",
                code,
                message: "这次连接没有成功，你的提问已经保留，可以稍后重试。",
              }]),
              status: "failed",
              executionMeta: executionMeta ? JSON.stringify(executionMeta) : "{}",
            },
          });
          return;
        }

        // 更新助手消息为 failed
        await tx.chatMessage.update({
          where: { id: turn.assistantMessageId },
          data: {
            content: partialText,
            parts: JSON.stringify([{
              type: "error",
              code,
              message: "这次连接没有成功，你的提问已经保留，可以稍后重试。",
            }]),
            status: "failed",
            executionMeta: executionMeta ? JSON.stringify(executionMeta) : "{}",
          },
        });

        // 释放锁
        await tx.chatConversation.update({
          where: { id: turn.conversationId },
          data: {
            activeTurnId: null,
            activeTurnStartedAt: null,
            lastMessageAt: new Date(),
          },
        });
      });
    },
  };
}

// ── 错误类型 ────────────────────────────────────

export class TurnServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "TurnServiceError";
  }
}
