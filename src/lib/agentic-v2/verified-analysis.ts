import { analyzeGrowthData } from "@/agentic-v2/skills/growth-analyzer/analyzer";
import type { AnalyzerInput } from "@/agentic-v2/skills/growth-analyzer/schema";
import { parseEvidenceBundle } from "@/agentic-v2/skills/evidence-parser/parser";
import type { LoadAgenticV2SnapshotResult } from "@/lib/chat/agentic-v2-snapshot";
import type { PlatformEvidenceBundleV1 } from "./platform-contracts";
import type { SerializableJsonValue } from "./contracts";

type VerifiedAnalysis = NonNullable<PlatformEvidenceBundleV1["verifiedAnalysis"]>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

function finiteScores(value: unknown): Record<string, number> | undefined {
  const source = record(value);
  if (!source) return undefined;
  const scores = Object.fromEntries(
    Object.entries(source).filter(([, score]) => typeof score === "number" && Number.isFinite(score)),
  ) as Record<string, number>;
  return Object.keys(scores).length > 0 ? scores : undefined;
}

/**
 * 用仓库内的 Skill 核心函数生成“已计算、可追溯”的输入分析。
 * 结果只供模型解释，不写正式数据，也不替代模型自行做推断。
 */
export function buildVerifiedAnalysis(
  snapshot: LoadAgenticV2SnapshotResult,
  evidenceBundle: PlatformEvidenceBundleV1,
): VerifiedAnalysis {
  try {
    const parsedEvidence = parseEvidenceBundle({
      evidenceBundle: evidenceBundle as unknown as Parameters<typeof parseEvidenceBundle>[0]["evidenceBundle"],
    });
    const profileData = record(snapshot.profileSnapshot.data) ?? {};
    const historyData = record(snapshot.historySnapshot.data) ?? {};
    const activePlan = record(historyData.activePlan);
    const fallbackTime = snapshot.currentTime;

    const planHistory: AnalyzerInput["planHistory"] = activePlan
      && text(activePlan.id)
      && text(activePlan.status)
      ? [{
          id: text(activePlan.id),
          targetRole: text(activePlan.targetRole) || undefined,
          targetRoleLabel: text(activePlan.targetRoleLabel) || null,
          status: text(activePlan.status),
          currentMonthIndex: typeof activePlan.currentMonthIndex === "number"
            ? activePlan.currentMonthIndex
            : undefined,
          version: typeof activePlan.version === "number" ? activePlan.version : undefined,
          createdAt: iso(activePlan.createdAt, fallbackTime),
          updatedAt: iso(activePlan.updatedAt, fallbackTime),
        }]
      : [];

    const progressLogs: AnalyzerInput["progressLogs"] = list(historyData.recentProgress)
      .filter((item) => text(item.id) && text(item.eventType))
      .map((item) => ({
        id: text(item.id),
        eventType: text(item.eventType),
        title: text(item.title) || undefined,
        summary: text(item.summary) || undefined,
        createdAt: iso(item.createdAt, fallbackTime),
      }));

    const simulations: AnalyzerInput["simulations"] = list(historyData.recentSimulations)
      .filter((item) => text(item.id) && text(item.scenarioKey))
      .map((item) => ({
        id: text(item.id),
        scenarioKey: text(item.scenarioKey),
        scenarioTitle: text(item.scenarioTitle) || undefined,
        score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null,
        status: "completed",
        turnCount: typeof item.turnCount === "number" ? item.turnCount : undefined,
        createdAt: iso(item.completedAt, fallbackTime),
        updatedAt: iso(item.completedAt, fallbackTime),
      }));

    const growth = analyzeGrowthData({
      profileSnapshot: {
        available: snapshot.profileSnapshot.available,
        data: {
          abilityScores: finiteScores(profileData.abilityScores),
          targetRole: text(profileData.targetRole) || undefined,
          targetRoleLabel: text(profileData.targetRoleLabel) || undefined,
        },
      },
      planHistory,
      progressLogs,
      simulations,
      historicalScores: [],
    });

    const serializableData = JSON.parse(JSON.stringify({
      evidence: parsedEvidence,
      growth,
    })) as SerializableJsonValue;

    return {
      available: true,
      algorithmVersion: "careermate-skills-v1",
      data: serializableData,
    };
  } catch (error) {
    return {
      available: false,
      algorithmVersion: "careermate-skills-v1",
      data: {
        reason: error instanceof Error ? error.message.slice(0, 500) : "verified_analysis_failed",
      },
    };
  }
}
