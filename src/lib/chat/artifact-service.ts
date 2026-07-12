import { getPrisma } from "@/lib/prisma";
import { getTboxConfig } from "@/lib/env";
import { profileDto } from "@/lib/dto";
import { serializePlan } from "@/lib/career";
import { toJson } from "@/lib/json";
import { generatePlanWithTbox } from "@/lib/tbox";
import { generateStructuredWithTbox } from "@/lib/tbox/adapter";
import {
  explorationReportSchema,
  type ExplorationReport,
} from "@/lib/careers/exploration-schema";
import type { AiExecutionMeta } from "@/lib/types";
import type { ChatMessagePart } from "./persistence";
import {
  citationsPart,
  explorationReportRefPart,
  planRefPart,
  profileCandidateRefPart,
} from "./artifacts";

interface CandidateInput {
  userId: string;
  sourceConversationId: string;
  field: string;
  newValue: unknown;
  confidence: number;
  reason: string;
  evidenceExcerpt: string;
  impactSummary: string;
}

interface ResearchResult {
  report: ExplorationReport;
  meta: AiExecutionMeta;
}

export interface ChatArtifactDependencies {
  createProfileCandidate(input: CandidateInput): Promise<string>;
  createPendingPlan(userId: string): Promise<{ id: string; version: number }>;
  researchCareer(roleName: string, userId: string): Promise<ResearchResult>;
  createExplorationReport(input: {
    userId: string;
    conversationId: string;
    report: ExplorationReport;
    meta: AiExecutionMeta;
  }): Promise<string>;
}

interface ChatArtifactInput {
  userId: string;
  conversationId: string;
  message: string;
}

const knownRoleNames = new Set([
  "ai产品经理",
  "数据分析师",
  "内容运营",
  "aigc内容运营",
]);

function weeklyHours(message: string) {
  const matched = message.match(/每周(?:可以|能够|能|可)?(?:投入|学习|安排)?\s*(\d{1,2})\s*(?:个)?小时/);
  if (!matched) return null;
  const value = Number(matched[1]);
  return value >= 1 && value <= 80 ? value : null;
}

function requestedRole(message: string) {
  const patterns = [
    /(?:介绍|了解|研究|想做|想成为|转行做)\s*([A-Za-z0-9\u4e00-\u9fa5·]{2,20}?)(?:这个)?(?:岗位|职业|需要|的|，|。|,|\?|？|$)/i,
    /([A-Za-z0-9\u4e00-\u9fa5·]{2,20})这个(?:岗位|职业)/i,
  ];
  for (const pattern of patterns) {
    const role = message.match(pattern)?.[1]?.trim().replace(/^一下/, "");
    if (role) return role;
  }
  return null;
}

function isKnownRole(roleName: string) {
  return knownRoleNames.has(roleName.toLowerCase().replace(/\s+/g, ""));
}

function requestsPlan(message: string) {
  return /(?:制定|生成|调整|重做|规划).{0,10}(?:计划|路径)|(?:三个月|90天|本周).{0,8}(?:计划|行动)/.test(message);
}

function safeMockReport(roleName: string): ExplorationReport {
  return {
    roleName,
    summary: `当前处于本地辅助模式，先为“${roleName}”建立探索框架；联网事实需要在百宝箱真实搜索成功后补充。`,
    responsibilities: [],
    coreCompetencies: [],
    entryPaths: [],
    marketSignals: [],
    learningSuggestions: ["先收集 3 个权威岗位说明，再对照个人经历补充能力证据。"],
    fitAnalysis: ["AI推断：现有信息不足，暂不判断匹配程度。"],
    risksAndUncertainties: ["尚未取得实时联网来源，不能把市场信息视为已核验事实。"],
    sources: [{
      title: "本地辅助分析",
      organization: "CareerMate",
      accessedAt: new Date().toISOString().slice(0, 10),
      label: "AI分析与推断",
    }],
  };
}

function normalizeResearchSources(result: ResearchResult): ResearchResult {
  if (result.meta.actualMode === "api" && !result.meta.degraded) return result;
  return {
    ...result,
    report: {
      ...result.report,
      sources: result.report.sources.map((source) => ({
        ...source,
        url: undefined,
        label: "AI分析与推断" as const,
      })),
    },
  };
}

const productionDependencies: ChatArtifactDependencies = {
  async createProfileCandidate(input) {
    const db = getPrisma();
    const serializedValue = toJson(input.newValue);
    const existing = await db.profileUpdateCandidate.findFirst({
      where: {
        userId: input.userId,
        field: input.field,
        newValue: serializedValue,
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing.id;
    const profile = await db.userProfile.findUnique({ where: { userId: input.userId } });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    const oldValue = input.field === "weeklyAvailableHours"
      ? profile.weeklyAvailableHours
      : null;
    const candidate = await db.profileUpdateCandidate.create({
      data: {
        userId: input.userId,
        source: "chat",
        field: input.field,
        oldValue: toJson(oldValue),
        newValue: serializedValue,
        confidence: input.confidence,
        reason: input.reason,
        sourceConversationId: input.sourceConversationId,
        evidenceExcerpt: input.evidenceExcerpt,
        impactSummary: input.impactSummary,
        status: "pending",
      },
    });
    return candidate.id;
  },

  async createPendingPlan(userId) {
    const db = getPrisma();
    const profile = await db.userProfile.findUnique({ where: { userId } });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    const generated = await generatePlanWithTbox(profileDto(profile));
    return db.$transaction(async (transaction) => {
      const latest = await transaction.careerPlan.findFirst({
        where: { userId },
        orderBy: { version: "desc" },
      });
      const created = await transaction.careerPlan.create({
        data: {
          userId,
          targetRole: profile.targetRole,
          version: (latest?.version ?? 0) + 1,
          status: "pending",
          ...serializePlan(generated.data),
          generationMeta: toJson({ ...generated.meta, triggeredBy: "chat" }),
        },
      });
      return { id: created.id, version: created.version };
    });
  },

  async researchCareer(roleName, userId) {
    const result = await generateStructuredWithTbox({
      config: getTboxConfig(),
      userId,
      prompt: [
        `请调研职业“${roleName}”。如果职业库未覆盖，必须调用百宝箱 search_engine。`,
        "优先政府/职业标准、行业协会、企业官方页面和权威研究报告。",
        "只输出符合职业探索报告结构的 JSON；事实来源写访问日期和 URL，AI判断标为AI分析与推断。",
      ].join("\n"),
      schema: explorationReportSchema,
      manual: async () => null,
      mock: () => safeMockReport(roleName),
    });
    return normalizeResearchSources({ report: result.data, meta: result.meta });
  },

  async createExplorationReport(input) {
    const db = getPrisma();
    const created = await db.careerExplorationReport.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        roleName: input.report.roleName,
        status: "exploratory",
        content: toJson(input.report),
        sources: toJson(input.report.sources),
        executionMeta: toJson(input.meta),
      },
    });
    return created.id;
  },
};

export async function createArtifactsForChat(
  input: ChatArtifactInput,
  dependencies: ChatArtifactDependencies = productionDependencies,
): Promise<ChatMessagePart[]> {
  const parts: ChatMessagePart[] = [];
  const hours = weeklyHours(input.message);
  if (hours !== null) {
    const candidateId = await dependencies.createProfileCandidate({
      userId: input.userId,
      sourceConversationId: input.conversationId,
      field: "weeklyAvailableHours",
      newValue: hours,
      confidence: 0.99,
      reason: "用户在对话中明确说明了每周可投入时间。",
      evidenceExcerpt: input.message,
      impactSummary: "确认后，后续计划会按新的每周可投入时间调整任务强度。",
    });
    parts.push(profileCandidateRefPart(candidateId));
  }

  if (requestsPlan(input.message)) {
    const plan = await dependencies.createPendingPlan(input.userId);
    parts.push(planRefPart(plan.id, plan.version));
  }

  const roleName = requestedRole(input.message);
  if (roleName && !isKnownRole(roleName)) {
    const research = await dependencies.researchCareer(roleName, input.userId);
    const reportId = await dependencies.createExplorationReport({
      userId: input.userId,
      conversationId: input.conversationId,
      report: research.report,
      meta: research.meta,
    });
    parts.push(explorationReportRefPart(reportId));
    if (research.report.sources.length > 0) {
      parts.push(citationsPart(research.report.sources.map((source) => ({
        title: source.title,
        source: source.organization,
        url: source.url,
        accessedAt: source.accessedAt,
        label: source.label,
      }))));
    }
  }
  return parts;
}
