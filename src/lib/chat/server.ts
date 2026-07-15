import { buildCareerChatPrompt, classifyCareerChatIntent, createSafeCareerContext } from "./context";
import type { CareerChatContextMeta } from "./types";
import { getTboxConfig } from "@/lib/env";
import { parseJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { retrieveWithTbox, type RetrievalInput } from "@/lib/tbox/retrieval";
import type { AiResult, RetrievalItem } from "@/lib/tbox/types";

export interface CareerChatDependencies {
  loadProfile(userId: string): Promise<unknown>;
  loadActivePlan(userId: string): Promise<unknown>;
  loadMemories(userId: string): Promise<unknown[]>;
  retrieve(input: RetrievalInput): Promise<AiResult<{ items: RetrievalItem[] }>>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseArray(value: unknown) {
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? parseJson<unknown[]>(value, []) : [];
}

function parseObject(value: unknown) {
  if (record(value)) return value;
  return typeof value === "string" ? parseJson<Record<string, unknown>>(value, {}) : {};
}

function normalizedProfile(value: unknown) {
  const source = record(value);
  if (!source) return null;
  return {
    ...source,
    learningPreference: parseArray(source.learningPreference),
    abilityScores: parseObject(source.abilityScores),
  };
}

function normalizedPlan(value: unknown) {
  const source = record(value);
  if (!source) return null;
  const months = parseArray(source.months);
  const currentMonthIndex =
    typeof source.currentMonthIndex === "number" ? source.currentMonthIndex : 1;
  const currentMonth =
    record(source.currentMonth) ??
    months.map(record).find((month) => month?.monthIndex === currentMonthIndex) ??
    null;
  return {
    ...source,
    currentMonthIndex,
    currentMonth,
    assumptions: parseArray(source.assumptions),
    riskNotes: parseArray(source.riskNotes),
  };
}

const productionDependencies: CareerChatDependencies = {
  async loadProfile(userId) {
    return getPrisma().userProfile.findUnique({
      where: { userId },
      select: {
        educationStage: true,
        major: true,
        targetRole: true,
        targetRoleLabel: true,
        weeklyAvailableHours: true,
        learningPreference: true,
        abilityScores: true,
        memoryEnabled: true,
      },
    });
  },
  async loadActivePlan(userId) {
    return getPrisma().careerPlan.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
      select: {
        targetRole: true,
        currentMonthIndex: true,
        months: true,
        assumptions: true,
        riskNotes: true,
      },
    });
  },
  async loadMemories(userId) {
    return getPrisma().memoryItem.findMany({
      where: { userId, status: "confirmed", sensitivity: "normal" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { content: true, status: true, sensitivity: true },
    });
  },
  retrieve(input) {
    return retrieveWithTbox(input, { config: getTboxConfig() });
  },
};

export async function prepareCareerChat(
  input: { userId: string; question: string; scope?: string },
  dependencyOverrides: Partial<CareerChatDependencies> = {},
): Promise<{
  enhancedQuestion: string;
  contextMeta: CareerChatContextMeta;
}> {
  const dependencies = { ...productionDependencies, ...dependencyOverrides };
  const rawProfile = await dependencies.loadProfile(input.userId);
  const memoryEnabled = record(rawProfile)?.memoryEnabled !== false;
  const [rawPlan, rawMemories] = await Promise.all([
    dependencies.loadActivePlan(input.userId),
    memoryEnabled ? dependencies.loadMemories(input.userId) : Promise.resolve([]),
  ]);
  const context = createSafeCareerContext({
    profile: normalizedProfile(rawProfile),
    plan: normalizedPlan(rawPlan),
    memories: rawMemories,
  });

  // B7: scope 感知裁剪——general_minimal/privacy 不发送职业画像、计划和记忆
  if (input.scope === "general_minimal" || input.scope === "privacy") {
    context.profile = null;
    context.currentPlan = null;
    context.memories = [];
  }
  const intent = classifyCareerChatIntent(input.question);
  // 默认 agent 模式：让主 Agent 自己选择知识库，不再预检索
  const retrievalMode = (await import("@/lib/env")).getTboxConfig().retrievalMode;
  let knowledgeItems: RetrievalItem[] = [];
  let retrievalMeta: CareerChatContextMeta["retrievalMeta"] = null;
  if (retrievalMode === "hybrid" && intent) {
    const role = context.profile?.targetRoleLabel ?? context.profile?.targetRole;
    const query = [role, input.question].filter(Boolean).join(" ");
    try {
      const result = await dependencies.retrieve({ datasetKey: intent, query, limit: 3 });
      knowledgeItems = result.data.items.filter(
        (item) => item.content.trim() && item.source.trim(),
      );
      retrievalMeta = result.meta;
    } catch {
      knowledgeItems = [];
      retrievalMeta = null;
    }
  }
  const knowledgeSources = [...new Set(knowledgeItems.map((item) => item.source))];
  const contextMeta: CareerChatContextMeta = {
    intent,
    usedProfile: Boolean(context.profile && Object.keys(context.profile).length),
    usedPlan: Boolean(context.currentPlan),
    usedMemoryCount: context.memories.length,
    knowledgeSources,
    retrievalMeta,
  };
  return {
    enhancedQuestion: buildCareerChatPrompt({
      question: input.question,
      context,
      knowledgeItems,
    }),
    contextMeta,
  };
}
