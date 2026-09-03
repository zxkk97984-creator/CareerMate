import { z } from "zod";
import { parseOnboardingExecutionMetadata } from "@/lib/onboarding-transcript";
import type { AiExecutionMeta, AiMode } from "@/lib/types";

export type AiRuntimeSnapshot = AiExecutionMeta;

const modeSchema = z.enum(["api", "manual", "mock"]);
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
    const executionMetadata = parseOnboardingExecutionMetadata(conversation.transcript);
    const executionMeta = executionMetadata.at(-1);
    if (executionMeta) {
      return executionMeta.requestedMode === requestedMode
        ? executionMeta
        : configuredWithoutExecution(requestedMode, "configured-no-execution");
    }
    const persistedRequestedMode = modeSchema.safeParse(conversation.requestedMode);
    if (persistedRequestedMode.success && persistedRequestedMode.data !== requestedMode) {
      return configuredWithoutExecution(requestedMode, "configured-no-execution");
    }
  }
  return configuredWithoutExecution(requestedMode, "configured-no-execution");
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
