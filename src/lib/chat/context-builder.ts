import type { ConversationTask, AwaitingQuestion } from "./conversation-state";

// ── 上下文范围 ──────────────────────────────────

export type ContextScope = "career_full" | "career_minimal" | "general_minimal" | "privacy";

// ── AgentContext ─────────────────────────────────

export interface AgentContextProfile {
  educationStage?: string;
  major?: string;
  targetRole?: string;
  targetRoleLabel?: string;
  weeklyAvailableHours?: number;
  learningPreference: string[];
  experienceSummary?: string;
  constraints: string[];
}

export interface AgentContextMemory {
  id: string;
  kind: string;
  content: string;
}

export interface AgentContextActivePlan {
  id: string;
  targetRole: string;
  summary: string;
  immediateActions: string[];
}

export interface AgentContextConversation {
  summary: string;
  currentTask: ConversationTask;
  awaitingQuestion: AwaitingQuestion | null;
  answeredQuestionKeys: string[];
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AgentContext {
  schemaVersion: 1;
  contextVersion: number;
  profileVersion: number;
  scope: ContextScope;
  profile: AgentContextProfile | null;
  memories: AgentContextMemory[];
  activePlan: AgentContextActivePlan | null;
  conversation: AgentContextConversation;
  policy: {
    confirmationRequiredFor: string[];
    unrelatedQuestionsMayBeAnswered: true;
    memoryWritesAllowed: boolean;
  };
  searchPolicy: "off" | "allowed" | "required";
}

// ── 安全上下文构建 ─────────────────────────────

const MAX_RECENT_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_SUMMARY_CHARS = 2_000;
const MAX_MEMORIES = 5;
const MAX_MEMORY_CHARS = 400;
const TOTAL_BUDGET_CHARS = 12_000;

export interface ContextBuilderInput {
  profile: AgentContextProfile | null;
  profileVersion: number;
  memories: AgentContextMemory[];
  activePlan: AgentContextActivePlan | null;
  conversation: {
    contextVersion: number;
    summary: string;
    currentTask: ConversationTask;
    awaitingQuestion: AwaitingQuestion | null;
    answeredQuestionKeys: string[];
    recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  };
  userMessage: string;
}

export function determineScope(input: ContextBuilderInput): ContextScope {
  // 有进行中的任务或等待回答 → career_full
  if (
    input.conversation.currentTask.kind !== "idle" ||
    input.conversation.awaitingQuestion !== null
  ) {
    return "career_full";
  }
  // 隐私/删除/账户 → privacy
  const msg = input.userMessage.toLowerCase();
  if (
    msg.includes("删除") || msg.includes("隐私") || msg.includes("账户") ||
    msg.includes("清除") || msg.includes("清空") || msg.includes("导出")
  ) {
    return "privacy";
  }
  // 职业相关关键词 → career_full
  const careerKeywords = [
    "职业", "岗位", "工作", "招聘", "面试", "简历", "学习", "技能",
    "规划", "计划", "转行", "能力", "发展", "成长", "薪资", "行业",
  ];
  if (careerKeywords.some((k) => msg.includes(k))) {
    return "career_full";
  }
  // 其他 → general_minimal
  return "general_minimal";
}

export function trimRecentMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const valid = messages.filter(
    (m) => m.content && typeof m.content === "string",
  );
  let selected = valid.slice(-MAX_RECENT_MESSAGES);
  let totalChars = selected.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > MAX_MESSAGE_CHARS && selected.length > 2) {
    selected = selected.slice(1);
    totalChars = selected.reduce((sum, m) => sum + m.content.length, 0);
  }
  return selected;
}

export function buildAgentContext(input: ContextBuilderInput): AgentContext {
  const scope = determineScope(input);
  const recentMessages = trimRecentMessages(input.conversation.recentMessages);

  const context: AgentContext = {
    schemaVersion: 1,
    contextVersion: input.conversation.contextVersion,
    profileVersion: input.profileVersion,
    scope,
    profile: scope === "general_minimal" || scope === "privacy" ? null : input.profile,
    memories:
      scope === "career_full"
        ? input.memories.slice(0, MAX_MEMORIES).map((m) => ({
            ...m,
            content: m.content.slice(0, MAX_MEMORY_CHARS),
          }))
        : [],
    activePlan: scope === "career_full" ? input.activePlan : null,
    conversation: {
      summary: input.conversation.summary.slice(0, MAX_SUMMARY_CHARS),
      currentTask: input.conversation.currentTask,
      awaitingQuestion: input.conversation.awaitingQuestion,
      answeredQuestionKeys: input.conversation.answeredQuestionKeys,
      recentMessages,
    },
    policy: {
      confirmationRequiredFor:
        scope === "career_full"
          ? ["targetRole", "weeklyAvailableHours"]
          : [],
      unrelatedQuestionsMayBeAnswered: true,
      memoryWritesAllowed: scope === "career_full",
    },
    searchPolicy: scope === "career_full" ? "allowed" : "off",
  };

  return context;
}

export const CONTEXT_BUDGET_CHARS = TOTAL_BUDGET_CHARS;
