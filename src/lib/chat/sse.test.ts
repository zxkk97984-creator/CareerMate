import { afterEach, describe, expect, it, vi } from "vitest";
import { startSseHeartbeat } from "./sse";

afterEach(() => {
  vi.useRealTimers();
});

describe("SSE heartbeat", () => {
  it("keeps writing keepalive events until stopped", () => {
    vi.useFakeTimers();
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    const stop = startSseHeartbeat(controller, 1_000);
    vi.advanceTimersByTime(2_000);
    expect(chunks).toHaveLength(2);
    expect(new TextDecoder().decode(chunks[0])).toContain("event: heartbeat");

    stop();
    vi.advanceTimersByTime(2_000);
    expect(chunks).toHaveLength(2);
  });

  it("stops itself when the stream controller is already closed", () => {
    vi.useFakeTimers();
    const enqueue = vi.fn(() => {
      throw new Error("closed");
    });
    const controller = {
      enqueue,
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    startSseHeartbeat(controller, 1_000);
    vi.advanceTimersByTime(2_000);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
