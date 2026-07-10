import type { AiMode } from "@/lib/types";

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
