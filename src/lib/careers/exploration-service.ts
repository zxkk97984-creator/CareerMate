import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { explorationReportSchema, type ExplorationReport } from "./exploration-schema";
import { supportedRoleKeys, type SupportedRoleKey } from "@/lib/types";

// ── 错误 ────────────────────────────────────────────────

export class ExplorationServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
    this.name = "ExplorationServiceError";
  }
}

// ── 服务接口 ────────────────────────────────────────────

export interface CreateReportInput {
  userId: string;
  conversationId: string | null;
  report: ExplorationReport;
}

export interface ExplorationService {
  createReport(input: CreateReportInput): Promise<{
    id: string;
    roleName: string;
    status: string;
  }>;

  submitForReview(
    reportId: string,
    userId: string,
  ): Promise<{ draftId: string }>;

  /** 判断职业来源路由：内置 → 知识库，未知 → 搜索 */
  resolveCareerSources(
    roleName: string,
  ): Promise<{
    sourceLabel: "精品职业资料" | "实时联网调研";
    knowledgeSources: Array<{ title: string; organization: string; label: string }>;
    isKnownRole: boolean;
  }>;
}

// ── 辅助 ────────────────────────────────────────────────

/** 确保 fitAnalysis 条目标注 AI 推断 */
function normalizeFitAnalysis(report: ExplorationReport): ExplorationReport {
  return {
    ...report,
    fitAnalysis: report.fitAnalysis.map((item) =>
      item.startsWith("AI推断") || item.includes("AI推断") || item.includes("AI 推断")
        ? item
        : `AI推断: ${item}`,
    ),
  };
}

/** 去除报告中的个人内容（fitAnalysis）用于提交审核 */
function depersonalizeReport(report: ExplorationReport): Omit<ExplorationReport, "fitAnalysis"> {
  return Object.fromEntries(
    Object.entries(report).filter(([key]) => key !== "fitAnalysis"),
  ) as Omit<ExplorationReport, "fitAnalysis">;
}

// ── 实现 ────────────────────────────────────────────────

export function createExplorationService(): ExplorationService {
  const db = getPrisma();

  return {
    async createReport(input) {
      // Schema 校验
      const parsed = explorationReportSchema.safeParse(input.report);
      if (!parsed.success) {
        throw new ExplorationServiceError(
          "报告内容不合法",
          "INVALID_REPORT",
          400,
        );
      }

      // 标注 fitAnalysis
      const normalized = normalizeFitAnalysis(parsed.data);

      const row = await db.careerExplorationReport.create({
        data: {
          userId: input.userId,
          conversationId: input.conversationId,
          roleName: normalized.roleName,
          roleKey: null,
          status: "exploratory",
          content: toJson(normalized),
          sources: toJson(normalized.sources),
          executionMeta: "{}",
          generatedAt: new Date(),
        },
      });

      return {
        id: row.id,
        roleName: row.roleName,
        status: row.status,
      };
    },

    async submitForReview(reportId, userId) {
      try {
        return await db.$transaction(async (transaction) => {
          const report = await transaction.careerExplorationReport.findFirst({
            where: { id: reportId, userId },
          });
          if (!report) {
            throw new ExplorationServiceError("报告不存在", "NOT_FOUND", 404);
          }
          if (report.status === "submitted") {
            throw new ExplorationServiceError("该报告已提交审核", "ALREADY_SUBMITTED", 409);
          }

          let parsed: ExplorationReport;
          try {
            parsed = explorationReportSchema.parse(JSON.parse(report.content));
          } catch {
            throw new ExplorationServiceError("报告内容损坏", "INVALID_REPORT", 400);
          }
          const depersonalized = depersonalizeReport(parsed);
          const draft = await transaction.roleDraft.create({
            data: {
              roleKey: report.roleKey ?? report.roleName.toLowerCase().replace(/\s+/g, "_"),
              roleName: report.roleName,
              category: "用户提交",
              content: toJson(depersonalized),
              status: "pending",
              sourceReportId: report.id,
            },
          });
          await transaction.careerExplorationReport.update({
            where: { id: reportId },
            data: { status: "submitted" },
          });
          return { draftId: draft.id };
        });
      } catch (error) {
        if (error instanceof ExplorationServiceError) throw error;
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          throw new ExplorationServiceError("该报告已提交审核", "ALREADY_SUBMITTED", 409);
        }
        throw error;
      }
    },

    async resolveCareerSources(roleName) {
      // 尝试匹配内置职业
      const roleKey = roleName.toLowerCase().replace(/\s+/g, "_");
      const isKnownRole = supportedRoleKeys.includes(roleKey as SupportedRoleKey);

      if (isKnownRole) {
        // 内置职业：读取 RoleTemplate 的来源
        const template = await db.roleTemplate.findUnique({
          where: { roleKey },
        });
        if (template) {
          const sources = JSON.parse(template.sources || "[]") as Array<{
            title: string; organization: string; label: string;
          }>;
          return {
            sourceLabel: "精品职业资料",
            knowledgeSources: sources.length > 0 ? sources : [
              { title: `${roleName}职业标准`, organization: "CareerMate职业库", label: "已核验职业库" },
            ],
            isKnownRole: true,
          };
        }
      }

      // 未知职业：标注为需要联网调研
      return {
        sourceLabel: "实时联网调研",
        knowledgeSources: [],
        isKnownRole: false,
      };
    },
  };
}
