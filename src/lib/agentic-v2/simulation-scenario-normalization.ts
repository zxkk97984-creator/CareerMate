/**
 * 只对 simulation_scenario 的已知兼容形态做结构归一化。
 *
 * 平台模型偶尔会把 prompts/scoringDimensions 输出为对象数组。这里只提取
 * 其中已经存在的文本字段，不新增职业事实、评分或用户经历；归一化结果仍需
 * 通过 simulationScenarioDataSchema 的严格校验。
 */

function textFromObject(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidates = [
    record.hint,
    record.prompt,
    record.text,
    record.expectedBehavior,
    record.description,
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return candidates.length > 0 ? candidates.join("；") : null;
}

function dimensionFromObject(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const candidate = [record.dimension, record.name, record.label, record.title]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0);
  return candidate?.trim() || null;
}

function stringArray(value: unknown, convert: (item: unknown) => string | null): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map(convert)
    .filter((item): item is string => item !== null);
  return normalized.length > 0 ? normalized : null;
}

export interface SimulationScenarioNormalizationDefaults {
  sourceType?: "recommended" | "custom" | "job";
  sourceRef?: string | null;
}

export function normalizeSimulationScenarioArtifactData(
  value: unknown,
  defaults: SimulationScenarioNormalizationDefaults = {},
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const data = root.data;
  const rootSnapshot = root.scenarioSnapshot;
  const dataRecord = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : typeof rootSnapshot === "object" && rootSnapshot !== null && !Array.isArray(rootSnapshot)
      ? {}
      : null;
  if (!dataRecord) return value;
  const snapshot = dataRecord.scenarioSnapshot ?? rootSnapshot;
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return value;
  const snapshotRecord = snapshot as Record<string, unknown>;

  const nextSnapshot: Record<string, unknown> = { ...snapshotRecord };
  const prompts = stringArray(snapshotRecord.prompts, textFromObject);
  if (prompts) nextSnapshot.prompts = prompts;
  const scoringDimensions = stringArray(snapshotRecord.scoringDimensions, dimensionFromObject);
  if (scoringDimensions) nextSnapshot.scoringDimensions = scoringDimensions;
  const skills = stringArray(snapshotRecord.skills, dimensionFromObject);
  if (skills) nextSnapshot.skills = skills;

  const sourceType = dataRecord.sourceType ?? defaults.sourceType ?? "custom";
  const sourceRef = dataRecord.sourceRef ?? defaults.sourceRef ?? null;
  const rootWithoutScenarioSnapshot = { ...root };
  delete rootWithoutScenarioSnapshot.scenarioSnapshot;
  const summary = typeof root.summary === "string" && root.summary.trim().length > 0
    ? root.summary
    : typeof nextSnapshot.title === "string" && nextSnapshot.title.trim().length > 0
      ? nextSnapshot.title
      : "生成训练场景";
  return {
    ...rootWithoutScenarioSnapshot,
    summary,
    evidence: Array.isArray(root.evidence) ? root.evidence : [],
    sources: Array.isArray(root.sources) ? root.sources : [],
    assumptions: Array.isArray(root.assumptions) ? root.assumptions : [],
    warnings: Array.isArray(root.warnings) ? root.warnings : [],
    requiresUserConfirmation: typeof root.requiresUserConfirmation === "boolean"
      ? root.requiresUserConfirmation
      : root.status === "pending_confirmation",
    baseVersion: typeof root.baseVersion === "number" ? root.baseVersion : null,
    nextActions: Array.isArray(root.nextActions) ? root.nextActions : [],
    data: {
      ...dataRecord,
      sourceType,
      sourceRef,
      scenarioSnapshot: nextSnapshot,
    },
  };
}
