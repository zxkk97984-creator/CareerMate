import {
  type AnalyzerInput,
  type GrowthAnalysis,
  analyzerInputSchema,
} from "./schema";

// ---- 常量 ----

/** 分数低于此值标记为薄弱项 */
const WEAKNESS_THRESHOLD = 45;
/** 趋势判定阈值 */
const TREND_DELTA_THRESHOLD = 5;

// ---- 连续训练天数 ----

/**
 * 从进度日志中计算最长连续天数（按日期去重）。
 * 日期格式：ISO 8601 日期部分（YYYY-MM-DD）。
 */
function computeContinuousDays(dates: string[]): number {
  if (dates.length === 0) return 0;

  // 提取日期部分并去重排序
  const unique = [...new Set(dates.map((d) => d.slice(0, 10)))].sort();
  if (unique.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diffDays =
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      currentStreak += 1;
    } else {
      maxStreak = Math.max(maxStreak, currentStreak);
      currentStreak = 1;
    }
  }

  return Math.max(maxStreak, currentStreak);
}

// ---- 一致性评分 ----

/**
 * 基于事件时间间隔的方差计算一致性。
 * 间隔标准差越小，一致性越高。最少需要3个时间点。
 * 返回值 0-1，1 表示非常规律。
 */
function computeConsistencyScore(dates: string[]): number {
  if (dates.length < 3) return 0.3;

  const timestamps = dates
    .map((d) => new Date(d).getTime())
    .sort((a, b) => a - b);

  if (timestamps.length < 3) return 0.3;

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  if (mean === 0) return 0.3;

  const variance =
    intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean; // 变异系数

  // CV 越小越一致。CV>2 得 0.1，CV=0 得 0.95
  return Math.max(0.1, Math.min(0.95, 0.95 - cv * 0.4));
}

// ---- 能力变化分析 ----

function analyzeAbilityChanges(
  currentScores: Record<string, number> | undefined,
  historicalScores: AnalyzerInput["historicalScores"],
) {
  const changes: GrowthAnalysis["trends"]["abilityChanges"] = [];
  const current = currentScores ?? {};

  // 按能力分组历史数据点
  const historyByAbility = new Map<
    string,
    Array<{ score: number; date: string }>
  >();
  for (const entry of historicalScores) {
    const list = historyByAbility.get(entry.abilityKey) ?? [];
    list.push({ score: entry.score, date: entry.observedAt });
    historyByAbility.set(entry.abilityKey, list);
  }

  for (const [abilityKey, currentScore] of Object.entries(current)) {
    const history = historyByAbility.get(abilityKey) ?? [];
    history.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const initialScore =
      history.length > 0 ? history[0].score : currentScore;
    const delta = currentScore - initialScore;
    const direction =
      delta > TREND_DELTA_THRESHOLD
        ? "up"
        : delta < -TREND_DELTA_THRESHOLD
          ? "down"
          : "stable";

    changes.push({
      abilityKey,
      initialScore,
      currentScore,
      delta,
      direction,
      dataPoints: history.length + 1,
    });
  }

  return changes;
}

// ---- 计划完成率 ----

function analyzePlans(planHistory: AnalyzerInput["planHistory"]) {
  const plans = planHistory ?? [];
  const completed = plans.filter(
    (p) => p.status === "completed" || p.status === "archived",
  ).length;
  const active = plans.filter((p) => p.status === "active").length;
  const total = plans.length;
  return {
    planCompletionRate: total > 0 ? completed / total : 0,
    totalCompletedPlans: completed,
    totalActivePlans: active,
  };
}

// ---- 模拟训练进步 ----

function analyzeSimulations(simulations: AnalyzerInput["simulations"]) {
  const sims = simulations ?? [];
  const byScenario = new Map<
    string,
    Array<{ score: number | null; date: string }>
  >();

  for (const sim of sims) {
    const list = byScenario.get(sim.scenarioKey) ?? [];
    list.push({
      score: sim.score,
      date: sim.createdAt,
    });
    byScenario.set(sim.scenarioKey, list);
  }

  const progress: GrowthAnalysis["trends"]["simulationProgress"] = [];

  for (const [scenarioKey, entries] of byScenario) {
    entries.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const scores = entries
      .map((e) => e.score)
      .filter((s): s is number => s !== null);
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;
    const attempts = entries.length;

    let trend: GrowthAnalysis["trends"]["simulationProgress"][number]["trend"] =
      "insufficient_data";
    if (scores.length >= 2) {
      const first = scores[0];
      const last = scores[scores.length - 1];
      if (last - first > TREND_DELTA_THRESHOLD) trend = "improving";
      else if (first - last > TREND_DELTA_THRESHOLD) trend = "declining";
      else trend = "stable";
    }

    progress.push({
      scenarioKey,
      bestScore,
      attempts,
      trend,
    });
  }

  return progress;
}

// ---- 薄弱项标记 ----

function identifyWeaknesses(
  currentScores: Record<string, number> | undefined,
): string[] {
  if (!currentScores) return [];
  return Object.entries(currentScores)
    .filter(([, score]) => score < WEAKNESS_THRESHOLD)
    .sort(([, a], [, b]) => a - b)
    .map(([key]) => key);
}

function identifyStrongAreas(
  currentScores: Record<string, number> | undefined,
): string[] {
  if (!currentScores) return [];
  return Object.entries(currentScores)
    .filter(([, score]) => score >= 70)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key);
}

// ---- 敏感信息检测 ----

/**
 * 检测输入中是否包含明显的敏感信息。
 * 注意：此函数仅做基本检查，上游应在调用前完成脱敏。
 */
export function detectSensitiveFields(input: AnalyzerInput): string[] {
  const warnings: string[] = [];
  const json = JSON.stringify(input);

  if (json.match(/1[3-9]\d{9}/)) warnings.push("检测到手机号格式");
  if (json.match(/\d{17}[\dXx]/)) warnings.push("检测到身份证号格式");
  if (json.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/))
    warnings.push("检测到邮箱格式");

  return warnings;
}

// ---- 主入口 ----

/**
 * 分析用户成长数据，产出标准化趋势和摘要。
 * 纯函数，无副作用。不写入数据库，不发起网络请求。
 */
export function analyzeGrowthData(input: AnalyzerInput): GrowthAnalysis {
  // 宽容模式：safeParse 失败降级为空输入
  const parsed = analyzerInputSchema.safeParse(input);
  const data: AnalyzerInput = parsed.success
    ? parsed.data
    : {
        profileSnapshot: { available: false },
        planHistory: [],
        progressLogs: [],
        simulations: [],
        historicalScores: [],
      };

  const currentScores =
    data.profileSnapshot?.data?.abilityScores ?? {};

  const abilityChanges = analyzeAbilityChanges(
    currentScores,
    data.historicalScores,
  );

  const {
    planCompletionRate,
    totalCompletedPlans,
    totalActivePlans,
  } = analyzePlans(data.planHistory);

  const simulationProgress = analyzeSimulations(data.simulations);

  // 连续训练天数：从进度日志和模拟训练中提取日期
  const eventDates = [
    ...(data.progressLogs ?? []).map((p) => p.createdAt),
    ...(data.simulations ?? []).map((s) => s.createdAt),
  ];
  const continuousTrainingDays = computeContinuousDays(eventDates);
  const totalProgressEvents = (data.progressLogs ?? []).length;

  const weaknesses = identifyWeaknesses(currentScores);
  const strongAreas = identifyStrongAreas(currentScores);
  const consistencyScore = computeConsistencyScore(eventDates);

  const overallDirection = (() => {
    const upCount = abilityChanges.filter((c) => c.direction === "up").length;
    const downCount = abilityChanges.filter((c) => c.direction === "down").length;
    if (upCount === 0 && downCount === 0) return "insufficient_data" as const;
    if (upCount > downCount) return "improving" as const;
    if (downCount > upCount) return "declining" as const;
    return "stable" as const;
  })();

  return {
    schemaVersion: "1.0",
    analyzedAt: new Date().toISOString(),
    trends: {
      abilityChanges,
      planCompletionRate,
      totalCompletedPlans,
      totalActivePlans,
      simulationProgress,
      continuousTrainingDays,
      totalProgressEvents,
      weaknesses,
    },
    summary: {
      overallDirection,
      strongAreas,
      weakAreas: weaknesses,
      consistencyScore,
    },
  };
}
