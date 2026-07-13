import { z } from "zod";
import { failureReason, type TboxFailureReason } from "./errors";
import { getMockRetrievalItems } from "./fixtures";
import { requestRetrieval } from "./client";
import { normalizeRetrievalResponse } from "./normalization";
import type {
  AiResult,
  DatasetKey,
  RetrievalItem,
  TboxConfig,
  TboxDependencies,
} from "./types";

export const datasetKeySchema = z.enum([
  "roleCompetency",
  "learningResources",
  "simulationScenes",
  "ethicsRules",
  "careerTrends",
]);

export const retrievalInputSchema = z.object({
  datasetKey: datasetKeySchema,
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(10).default(5),
});

export type RetrievalInput = z.infer<typeof retrievalInputSchema>;

export function resolveDatasetId(config: TboxConfig, key: DatasetKey) {
  return config.datasetIds[key];
}

interface RetrievalDependencies extends TboxDependencies {
  local?: (input: RetrievalInput) => Promise<RetrievalItem[]>;
}

function meta(
  requestedMode: TboxConfig["mode"],
  actualMode: TboxConfig["mode"],
  fallbackReason: TboxFailureReason | null,
  source: string,
) {
  return {
    requestedMode,
    actualMode,
    degraded: requestedMode !== actualMode || fallbackReason !== null,
    fallbackReason,
    source,
  };
}

async function localItems(input: RetrievalInput, deps: RetrievalDependencies) {
  try {
    const items = deps.local ? await deps.local(input) : [];
    return items.filter(
      (item) => item.content.trim() && item.source.trim() && Number.isFinite(item.score),
    );
  } catch {
    return [];
  }
}

export async function retrieveWithTbox(
  input: RetrievalInput,
  deps: RetrievalDependencies,
): Promise<AiResult<{ items: RetrievalItem[] }>> {
  const requested = deps.config.mode;
  const mock = () => getMockRetrievalItems(input.datasetKey, input.limit);
  if (requested === "mock") {
    return { data: { items: mock() }, meta: meta(requested, "mock", null, "local-mock") };
  }
  if (requested === "manual") {
    const items = await localItems(input, deps);
    return items.length
      ? { data: { items }, meta: meta(requested, "manual", null, "local-knowledge-base") }
      : {
          data: { items: mock() },
          meta: meta(requested, "mock", "manual_unavailable", "local-mock"),
        };
  }

  let reason: TboxFailureReason;
  try {
    const datasetId = resolveDatasetId(deps.config, input.datasetKey);
    if (!datasetId) throw new Error("missing dataset");
    const payload = await requestRetrieval(
      { dataset_id: datasetId, query: input.query, limit: input.limit },
      deps,
    );
    const items = normalizeRetrievalResponse(payload).slice(0, input.limit);
    return { data: { items }, meta: meta(requested, "api", null, "tbox-api") };
  } catch (error) {
    reason = error instanceof Error && error.message === "missing dataset" ? "missing_config" : failureReason(error);
  }
  const items = await localItems(input, deps);
  return items.length
    ? { data: { items }, meta: meta(requested, "manual", reason, "local-knowledge-base") }
    : { data: { items: mock() }, meta: meta(requested, "mock", reason, "local-mock") };
}
