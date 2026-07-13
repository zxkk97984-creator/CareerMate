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

export class TboxError extends Error {
  constructor(
    public readonly reason: TboxFailureReason,
    public readonly code?: TboxErrorCode,
  ) {
    super(code ?? reason);
    this.name = "TboxError";
  }
}

export function failureReason(error: unknown): TboxFailureReason {
  return error instanceof TboxError ? error.reason : "invalid_response";
}
