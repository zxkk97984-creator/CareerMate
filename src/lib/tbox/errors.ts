export type TboxFailureReason =
  | "missing_config"
  | "timeout"
  | "http_error"
  | "provider_error"
  | "sse_error"
  | "invalid_response"
  | "validation_error"
  | "manual_unavailable"
  | "manual_invalid"
  | "aborted";

/** 可审计的公开错误码（用于日志和前端展示） */
export type TboxErrorCode =
  | "API_CONFIG_MISSING"
  | "API_AUTH_FAILED"
  | "AGENT_NOT_PUBLISHED"
  | "AGENT_ID_INVALID"
  | "SSE_PARSE_FAILED"
  | "EMPTY_RESPONSE"
  | "DUPLICATE_RESPONSE"
  | "SCHEMA_MISMATCH"
  | "TIMEOUT"
  | "ABORTED"
  | "PROVIDER_ERROR";

/** 安全错误类别——用于探针脱敏报告，不暴露内部细节 */
export type SafeFailureCategory =
  | "auth"
  | "config"
  | "timeout"
  | "provider"
  | "sse"
  | "invalid_response"
  | "aborted"
  | "unknown";

/** 可在安全报告中公开的百宝箱平台错误码白名单 */
export const SAFE_ERROR_CODE_WHITELIST = new Set<string>([
  "CHAT_NOT_FOUND",
  "CONVERSATION_NOT_FOUND",
  "INVALID_CONVERSATION_ID",
  "SESSION_EXPIRED",
  "CONVERSATION_RATE_LIMITED",
  "CONTEXT_LENGTH_EXCEEDED",
]);

export class TboxError extends Error {
  /** HTTP 状态码（安全保留，不拼接原始响应体） */
  public readonly httpStatus?: number;
  /** 公开平台错误码（仅白名单值可输出） */
  public readonly platformCode?: string;
  /** 安全失败类别 */
  public readonly category: SafeFailureCategory;

  constructor(
    public readonly reason: TboxFailureReason,
    public readonly code?: TboxErrorCode,
    opts?: { httpStatus?: number; platformCode?: string },
  ) {
    super(code ?? reason);
    this.name = "TboxError";
    this.httpStatus = opts?.httpStatus;
    // 只保留白名单内的平台错误码
    this.platformCode =
      opts?.platformCode && SAFE_ERROR_CODE_WHITELIST.has(opts.platformCode)
        ? opts.platformCode
        : undefined;
    this.category = classifyFailure(reason, this.httpStatus);
  }
}

function classifyFailure(reason: TboxFailureReason, httpStatus?: number): SafeFailureCategory {
  switch (reason) {
    case "missing_config":
      return "config";
    case "timeout":
      return "timeout";
    case "http_error":
      if (httpStatus === 401 || httpStatus === 403) return "auth";
      return "provider";
    case "provider_error":
      return "provider";
    case "sse_error":
      return "sse";
    case "invalid_response":
      return "invalid_response";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

export function failureReason(error: unknown): TboxFailureReason {
  return error instanceof TboxError ? error.reason : "invalid_response";
}
