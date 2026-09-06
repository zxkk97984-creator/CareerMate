import { describe, expect, it } from "vitest";
import { parseBodyJson, RequestBodyError, bodyTooLarge } from "./api";

function makeRequest(body: string | null, contentType = "application/json"): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": contentType },
    body: body ?? undefined,
  });
}

async function expectBodyError(work: Promise<unknown>, code: string, status: number) {
  const err = await work.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(RequestBodyError);
  const rbe = err as RequestBodyError;
  expect(rbe.code).toBe(code);
  expect(rbe.status).toBe(status);
}

describe("parseBodyJson（T23a 请求体边界）", () => {
  it("parses a valid JSON object", async () => {
    await expect(parseBodyJson(makeRequest('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it("returns 400-style error for malformed JSON instead of throwing a raw exception", async () => {
    await expectBodyError(parseBodyJson(makeRequest("{not json")), "INVALID_JSON", 400);
  });

  it("returns 400 for an empty body", async () => {
    await expectBodyError(parseBodyJson(makeRequest("")), "EMPTY_BODY", 400);
  });

  it("returns 413 when body exceeds the size limit", async () => {
    const big = JSON.stringify({ data: "x".repeat(60000) });
    await expectBodyError(parseBodyJson(makeRequest(big), 1024), "BODY_TOO_LARGE", 413);
  });

  it("bodyTooLarge factory yields a 413 RequestBodyError", () => {
    const err = bodyTooLarge();
    expect(err.code).toBe("BODY_TOO_LARGE");
    expect(err.status).toBe(413);
  });
});
