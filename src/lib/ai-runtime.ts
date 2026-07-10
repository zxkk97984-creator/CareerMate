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

function configuredWithoutExecution(requestedMode: AiMode, source: string): AiRuntimeSnapshot {
  return {
    requestedMode,
    actualMode: requestedMode,
    degraded: false,
    fallbackReason: null,
    source,
  };
}

export function recoverAiRuntime(
  requestedMode: AiMode,
  conversation: { requestedMode: string; actualMode: string; transcript: string } | null,
): AiRuntimeSnapshot {
  if (conversation) {
    const transcript = parseJson<Array<{ meta?: unknown }>>(conversation.transcript, []);
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const parsed = executionMetaSchema.safeParse(transcript[index]?.meta);
      if (parsed.success) {
        return parsed.data.requestedMode === requestedMode
          ? parsed.data
          : configuredWithoutExecution(requestedMode, "configured-no-execution");
      }
    }
    const actualMode = modeSchema.safeParse(conversation.actualMode);
    const persistedRequestedMode = modeSchema.safeParse(conversation.requestedMode);
    if (persistedRequestedMode.success && persistedRequestedMode.data !== requestedMode) {
      return configuredWithoutExecution(requestedMode, "configured-no-execution");
    }
    if (actualMode.success) {
      if (!persistedRequestedMode.success && actualMode.data !== requestedMode) {
        return configuredWithoutExecution(requestedMode, "configured-no-execution");
      }
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
  return configuredWithoutExecution(requestedMode, "runtime-config");
}

export function formatAiRuntimeBadge(runtime: {
  requestedMode: AiMode;
  actualMode?: AiMode;
  degraded?: boolean;
  source?: string;
}) {
  const requested = `TBOX_MODE=${runtime.requestedMode}`;
  if (runtime.source === "configured-no-execution") return `${requested}（尚未执行）`;
  if (!runtime.actualMode || runtime.actualMode === runtime.requestedMode) {
    return runtime.degraded ? `${requested}（已降级）` : requested;
  }
  return `${requested} → ${runtime.actualMode}${runtime.degraded ? "（已降级）" : ""}`;
}

export function formatAiRuntimeDescription(runtime: {
  requestedMode: AiMode;
  actualMode?: AiMode;
  degraded?: boolean;
  source?: string;
}) {
  if (runtime.source === "configured-no-execution") {
    return `配置 ${runtime.requestedMode} · 尚未执行`;
  }
  const actualMode = runtime.actualMode ?? runtime.requestedMode;
  return `请求 ${runtime.requestedMode} · 实际 ${actualMode}${runtime.degraded ? " · 已降级" : ""}`;
}
