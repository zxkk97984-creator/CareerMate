import { getPrisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { explorationReportSchema, type ExplorationReport } from "./exploration-schema";

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
      const report = await db.careerExplorationReport.findFirst({
        where: { id: reportId, userId },
      });
      if (!report) {
        throw new ExplorationServiceError("报告不存在", "NOT_FOUND", 404);
      }
      if (report.status === "submitted") {
        throw new ExplorationServiceError("该报告已提交审核", "ALREADY_SUBMITTED", 409);
      }

      // 解析报告内容，去个人化
      let parsed: ExplorationReport;
      try {
        parsed = JSON.parse(report.content) as ExplorationReport;
      } catch {
        throw new ExplorationServiceError("报告内容损坏", "INVALID_REPORT", 400);
      }

      const depersonalized = depersonalizeReport(parsed);

      // 创建 RoleDraft
      const draft = await db.roleDraft.create({
        data: {
          roleKey: report.roleKey ?? report.roleName.toLowerCase().replace(/\s+/g, "_"),
          roleName: report.roleName,
          category: "用户提交",
          content: toJson(depersonalized),
          status: "pending",
          sourceReportId: report.id,
        },
      });

      // 更新报告状态
      await db.careerExplorationReport.update({
        where: { id: reportId },
        data: { status: "submitted" },
      });

      return { draftId: draft.id };
    },
  };
}
