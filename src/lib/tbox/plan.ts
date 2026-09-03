import type { ProfileDto } from "@/lib/types";
import { getTboxConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { generateStructuredApi, generateStructuredWithTbox } from "./adapter";
import { getManualCareerPlanFixture, getMockCareerPlanFixture } from "./fixtures";
import {
  careerPlanSchema,
  yearPlanChunkSchema,
  type CareerPlan,
  type YearPlanChunk,
} from "./schemas";
import type { Clock, TboxConfig } from "./types";
import { failureReason, TboxError } from "./errors";
import type { AiResult } from "./types";

interface ManualSample {
  payload: string;
}

interface PlanDependencies {
  config?: TboxConfig;
  fetchImpl?: typeof fetch;
  clock?: Clock;
  loadManualSample?: () => Promise<ManualSample | null>;
}

function parseManualPayload(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    const validated = careerPlanSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function planPrompt(profile: ProfileDto) {
  return [
    "请生成一个严格的 JSON 职业规划对象，不要添加解释或 Markdown。",
    "对象必须包含 3 个 years、12 个 quarters、36 个 months，以及 assumptions 和 riskNotes。",
    "每个月必须包含 monthIndex、goal、learningTasks、practiceOutputs、evaluationMetrics。",
    "learningTasks 每项的 type 只能是 learn、practice、review、simulation 之一；status 只能是 not_started、in_progress、done、delayed 之一。",
    "practiceOutputs 和 evaluationMetrics 必须是字符串数组（例如 [\"完成项目报告\"]），即使只有一项也必须是数组，不能使用单个字符串。",
    `用户画像：${JSON.stringify({
      educationStage: profile.educationStage ?? null,
      major: profile.major ?? null,
      targetRole: profile.targetRole ?? null,
      targetRoleLabel: profile.targetRoleLabel ?? null,
      weeklyAvailableHours: profile.weeklyAvailableHours ?? null,
      learningPreference: profile.learningPreference,
      experienceSummary: profile.experienceSummary,
      interestTags: profile.interestTags,
      constraints: profile.constraints,
      abilityScores: profile.abilityScores,
    })}`,
  ].join("\n");
}

export async function generatePlanWithTbox(
  profile: ProfileDto,
  deps: PlanDependencies = {},
): Promise<AiResult<CareerPlan>> {
  const config = deps.config ?? getTboxConfig();
  const loadManualSample =
    deps.loadManualSample ??
    (() =>
      getPrisma().manualAiSample.findFirst({
        where: { scenario: `plan_generate_${profile.targetRole ?? "unknown"}` },
        select: { payload: true },
      }));
  let manualSource = "manual-fixture";

  const fallbackManual = async (): Promise<CareerPlan | null> => {
    const sample = await loadManualSample();
    const parsedSample = sample ? parseManualPayload(sample.payload) : null;
    if (parsedSample) {
      manualSource = "manual-ai-sample";
      return parsedSample;
    }
    manualSource = "manual-fixture";
    return getManualCareerPlanFixture(profile);
  };

  if (config.mode === "api") {
    let lastReason: ReturnType<typeof failureReason> | null = null;
    try {
      const chunks: YearPlanChunk[] = [];
      let prevSummary: string | null = null;
      for (let year = 1; year <= 3; year += 1) {
        let chunk: YearPlanChunk | null = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            chunk = await generateStructuredApi<YearPlanChunk>({
              config,
              userId: profile.userId,
              prompt: yearChunkPrompt(year, profile, prevSummary),
              schema: yearPlanChunkSchema,
              fetchImpl: deps.fetchImpl,
              clock: deps.clock,
            });
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (chunk === null) {
          lastReason = failureReason(lastError);
          throw new Error(`year ${year} chunk generation failed`);
        }
        chunks.push(chunk);
        prevSummary = summarizeYearChunk(chunk);
      }
      const data = mergeYearChunks(chunks);
      return {
        data,
        meta: {
          requestedMode: "api",
          actualMode: "api",
          degraded: false,
          fallbackReason: null,
          source: "tbox-api",
        },
      };
    } catch (error) {
      if (lastReason === null) lastReason = failureReason(error);
      const fixture = await fallbackManual();
      if (fixture) {
        return {
          data: fixture,
          meta: {
            requestedMode: "api",
            actualMode: "manual",
            degraded: true,
            fallbackReason: lastReason,
            source: manualSource,
          },
        };
      }
      return {
        data: getMockCareerPlanFixture(profile),
        meta: {
          requestedMode: "api",
          actualMode: "mock",
          degraded: true,
          fallbackReason: "manual_unavailable",
          source: "local-mock",
        },
      };
    }
  }

  return generateStructuredWithTbox<CareerPlan>({
    config,
    userId: profile.userId,
    prompt: planPrompt(profile),
    schema: careerPlanSchema,
    fetchImpl: deps.fetchImpl,
    clock: deps.clock,
    manual: async () => {
      return fallbackManual();
    },
    manualSource: () => manualSource,
    mock: () => getMockCareerPlanFixture(profile),
  });
}

export function yearChunkPrompt(
  yearNumber: number,
  profile: ProfileDto,
  prevSummary: string | null,
) {
  const quarterStart = (yearNumber - 1) * 4 + 1;
  const monthStart = (yearNumber - 1) * 12 + 1;
  const lines = [
    `请生成职业规划第 ${yearNumber} 年（共 3 年中的第 ${yearNumber} 年）的严格 JSON 对象，不要添加解释或 Markdown。`,
    `对象结构：year（yearIndex=${yearNumber}，含 goal、expectedOutputs）；quarters 4 个（quarterIndex 从 ${quarterStart} 到 ${quarterStart + 3}，每项含 goal、milestone、evaluation）；months 12 个（monthIndex 从 ${monthStart} 到 ${monthStart + 11}，每月含 monthIndex、goal、learningTasks（每项含 id、title、type、status；type 只能是 learn、practice、review、simulation 之一；status 只能是 not_started、in_progress、done、delayed 之一）、practiceOutputs、evaluationMetrics）；以及 assumptions 和 riskNotes。`,
    "practiceOutputs 和 evaluationMetrics 必须是字符串数组（例如 [\"完成项目报告\"]），即使只有一项也必须是数组，不能使用单个字符串。",
    `用户画像：${JSON.stringify({
      educationStage: profile.educationStage ?? null,
      major: profile.major ?? null,
      targetRole: profile.targetRole ?? null,
      targetRoleLabel: profile.targetRoleLabel ?? null,
      weeklyAvailableHours: profile.weeklyAvailableHours ?? null,
      learningPreference: profile.learningPreference ?? null,
      experienceSummary: profile.experienceSummary ?? null,
      interestTags: profile.interestTags ?? null,
      constraints: profile.constraints ?? null,
      abilityScores: profile.abilityScores ?? null,
    })}`,
  ];
  if (prevSummary) {
    lines.push(`前一年计划摘要（请保持连续性）：${prevSummary}`);
  }
  return lines.join("\n");
}

export function summarizeYearChunk(chunk: YearPlanChunk): string {
  const lastMonth = chunk.months[chunk.months.length - 1];
  return `第${chunk.year.yearIndex}年目标：${chunk.year.goal}；年末主题：${
    lastMonth?.goal ?? ""
  }`;
}

export function mergeYearChunks(chunks: YearPlanChunk[]): CareerPlan {
  const sorted = [...chunks].sort((a, b) => a.year.yearIndex - b.year.yearIndex);
  const years = sorted.map((chunk) => chunk.year);
  const quarters = sorted
    .flatMap((chunk) => chunk.quarters)
    .sort((a, b) => a.quarterIndex - b.quarterIndex);
  const months = sorted
    .flatMap((chunk) => chunk.months)
    .sort((a, b) => a.monthIndex - b.monthIndex);
  const assumptions = Array.from(new Set(sorted.flatMap((chunk) => chunk.assumptions)));
  const riskNotes = Array.from(new Set(sorted.flatMap((chunk) => chunk.riskNotes)));
  const parsed = careerPlanSchema.safeParse({ years, quarters, months, assumptions, riskNotes });
  if (!parsed.success) throw new TboxError("validation_error");
  return parsed.data;
}

export function planGenerationNote(meta: {
  actualMode: TboxConfig["mode"];
  degraded: boolean;
}) {
  if (meta.actualMode === "api") return "职业路径已由百宝箱 API 生成并通过结构校验。";
  if (meta.actualMode === "manual") {
    return meta.degraded
      ? "百宝箱 API 暂不可用，已使用经过校验的手工样例。"
      : "职业路径来自经过校验的手工样例。";
  }
  return meta.degraded
    ? "上游与手工样例不可用，已使用本地确定性规划。"
    : "职业路径来自本地确定性规划。";
}
