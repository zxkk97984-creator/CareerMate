import type { ProfileDto } from "@/lib/types";
import { getTboxConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { generateStructuredWithTbox } from "./adapter";
import { getManualCareerPlanFixture, getMockCareerPlanFixture } from "./fixtures";
import { careerPlanSchema, type CareerPlan } from "./schemas";
import type { Clock, TboxConfig } from "./types";

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
    `用户画像：${JSON.stringify({
      educationStage: profile.educationStage,
      major: profile.major,
      targetRole: profile.targetRole,
      targetRoleLabel: profile.targetRoleLabel,
      weeklyAvailableHours: profile.weeklyAvailableHours,
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
) {
  const config = deps.config ?? getTboxConfig();
  const loadManualSample =
    deps.loadManualSample ??
    (() =>
      getPrisma().manualAiSample.findFirst({
        where: { scenario: `plan_generate_${profile.targetRole}` },
        select: { payload: true },
      }));
  let manualSource = "manual-fixture";

  return generateStructuredWithTbox<CareerPlan>({
    config,
    userId: profile.userId,
    prompt: planPrompt(profile),
    schema: careerPlanSchema,
    fetchImpl: deps.fetchImpl,
    clock: deps.clock,
    manual: async () => {
      const sample = await loadManualSample();
      const parsedSample = sample ? parseManualPayload(sample.payload) : null;
      if (parsedSample) {
        manualSource = "manual-ai-sample";
        return parsedSample;
      }
      manualSource = "manual-fixture";
      return getManualCareerPlanFixture(profile);
    },
    manualSource: () => manualSource,
    mock: () => getMockCareerPlanFixture(profile),
  });
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
