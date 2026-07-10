import { z } from "zod";
import { parseJson } from "@/lib/json";
import type { AiExecutionMeta, AiMode } from "@/lib/types";

export type AiRuntimeSnapshot = AiExecutionMeta;

const modeSchema = z.enum(["api", "manual", "mock"]);
const executionMetaSchema = z.object({
  requestedMode: modeSchema,
  actualMode: modeSchema,
  degraded: z.boolean(),
  fallbackReason: z.string().nullable(),
  source: z.string().min(1),
});

export function recoverAiRuntime(
  requestedMode: AiMode,
  conversation: { requestedMode: string; actualMode: string; transcript: string } | null,
): AiRuntimeSnapshot {
  if (conversation) {
    const transcript = parseJson<Array<{ meta?: unknown }>>(conversation.transcript, []);
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const parsed = executionMetaSchema.safeParse(transcript[index]?.meta);
      if (parsed.success) return { ...parsed.data, requestedMode };
    }
    const actualMode = modeSchema.safeParse(conversation.actualMode);
    const persistedRequestedMode = modeSchema.safeParse(conversation.requestedMode);
    if (actualMode.success) {
      return {
        requestedMode,
        actualMode: actualMode.data,
        degraded: persistedRequestedMode.success
          ? persistedRequestedMode.data !== actualMode.data
          : requestedMode !== actualMode.data,
        fallbackReason: null,
        source: "persisted-onboarding-conversation",
      };
    }
  }
  return {
    requestedMode,
    actualMode: requestedMode,
    degraded: false,
    fallbackReason: null,
    source: "runtime-config",
  };
}

export function formatAiRuntimeBadge(runtime: {
  requestedMode: AiMode;
  actualMode?: AiMode;
  degraded?: boolean;
}) {
  const requested = `TBOX_MODE=${runtime.requestedMode}`;
  if (!runtime.actualMode || runtime.actualMode === runtime.requestedMode) {
    return runtime.degraded ? `${requested}（已降级）` : requested;
  }
  return `${requested} → ${runtime.actualMode}${runtime.degraded ? "（已降级）" : ""}`;
}

export function formatAiRuntimeDescription(runtime: {
  requestedMode: AiMode;
  actualMode?: AiMode;
  degraded?: boolean;
}) {
  const actualMode = runtime.actualMode ?? runtime.requestedMode;
  return `请求 ${runtime.requestedMode} · 实际 ${actualMode}${runtime.degraded ? " · 已降级" : ""}`;
}
