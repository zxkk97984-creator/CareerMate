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

export class TboxError extends Error {
  constructor(public readonly reason: TboxFailureReason) {
    super(reason);
    this.name = "TboxError";
  }
}

export function failureReason(error: unknown): TboxFailureReason {
  return error instanceof TboxError ? error.reason : "invalid_response";
}
