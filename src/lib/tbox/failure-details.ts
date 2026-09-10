import { TboxError } from "./errors";

export interface SafeTboxFailure {
  code: string;
  reason: string;
  category: string;
  httpStatus?: number;
  platformCode?: string;
}

/**
 * Convert an upstream failure into an allowlisted, persistence-safe diagnostic.
 * Never include the original error message: it may contain a response body or
 * provider details that are not safe to expose to the browser or logs.
 */
export function describeTboxFailure(error: unknown): SafeTboxFailure {
  if (error instanceof Error && error.message === "aborted") {
    return {
      code: "ABORTED",
      reason: "aborted",
      category: "aborted",
    };
  }

  if (!(error instanceof TboxError)) {
    return {
      code: "TBOX_UNAVAILABLE",
      reason: "unknown",
      category: "unknown",
    };
  }

  const failure: SafeTboxFailure = {
    code: error.code ?? "TBOX_UNAVAILABLE",
    reason: error.reason,
    category: error.category,
  };
  if (error.httpStatus !== undefined) failure.httpStatus = error.httpStatus;
  if (error.platformCode !== undefined) failure.platformCode = error.platformCode;
  return failure;
}

export function withTboxFailureMeta(
  baseMeta: Record<string, unknown> | null | undefined,
  error: unknown,
  failure: SafeTboxFailure = describeTboxFailure(error),
): Record<string, unknown> {
  return {
    ...(baseMeta ?? {}),
    degraded: true,
    failure,
  };
}

/** Keep live SSE errors and persisted history consistent. */
export function tboxFailureMessage(code: string): string {
  switch (code) {
    case "ABORTED":
      return "本次任务已中断，回复未完成。你的提问已保留，可以重试。";
    case "TIMEOUT":
      return "百宝箱长时间没有返回数据，本次等待已超时。你的提问已保留，可以稍后重试。";
    case "CONTEXT_BUDGET_EXCEEDED":
      return "本轮职业上下文超过当前传输预算，请刷新后重试或缩小本轮上下文。";
    default:
      return "这次连接没有成功，你的提问已经保留，可以稍后重试。";
  }
}
