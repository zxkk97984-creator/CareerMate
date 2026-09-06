import { NextResponse } from "next/server";

export function ok<T>(data: T, meta: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, data, meta });
}

export function fail(code: string, message: string, status = 400, detail?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, detail },
      meta: { requestId: crypto.randomUUID() },
    },
    { status },
  );
}

/** 请求体大小上限（T23a：body/字符串设合理上限，防超大请求） */
export const DEFAULT_BODY_LIMIT_BYTES = 16 * 1024; // 16KB

/**
 * 读取并解析 JSON 请求体（T23a）：
 * - 内容超上限 → 抛出带 code 的 `RequestBodyError`（调用方转 413）。
 * - malformed / 非法 JSON → 抛出 `RequestBodyError`（调用方转 400）。
 * - 空体 → 抛出 `RequestBodyError`（调用方转 400）。
 * 避免 `request.json()` 在坏体时抛出未归一化的原始异常。
 */
export function bodyTooLarge(message = "请求体过大"): RequestBodyError {
  return new RequestBodyError("BODY_TOO_LARGE", message, 413);
}

export class RequestBodyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export async function parseBodyJson(request: Request, limitBytes = DEFAULT_BODY_LIMIT_BYTES): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > limitBytes) throw bodyTooLarge("请求体过大，请精简后重试");
  if (!raw.trim()) throw new RequestBodyError("EMPTY_BODY", "请求体为空", 400);
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestBodyError("INVALID_JSON", "请求体不是合法 JSON", 400);
  }
}
