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
