import { describe, expect, it } from "vitest";
import { parseFrontendSseBlock } from "./frontend-sse";

describe("frontend SSE parsing", () => {
  it("reads canonical named SSE events", () => {
    expect(
      parseFrontendSseBlock(
        'event: message\ndata: {"type":"delta","content":"hello"}',
      ),
    ).toEqual({
      event: "message",
      data: { type: "delta", content: "hello" },
    });
  });

  it("keeps data-only message compatibility", () => {
    expect(
      parseFrontendSseBlock('data: {"type":"delta","content":"legacy"}'),
    ).toEqual({
      event: "message",
      data: { type: "delta", content: "legacy" },
    });
  });
});
