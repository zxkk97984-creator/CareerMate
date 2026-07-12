import { describe, expect, it } from "vitest";
import { requireApiOk } from "./client-api";

describe("requireApiOk", () => {
  it("returns data only for a successful API envelope", async () => {
    const data = await requireApiOk<{ id: string }>(new Response(JSON.stringify({
      ok: true,
      data: { id: "candidate-1" },
    }), { status: 200 }));

    expect(data).toEqual({ id: "candidate-1" });
  });

  it("throws the server message for a failed API envelope", async () => {
    const response = new Response(JSON.stringify({
      ok: false,
      error: { message: "候选已经处理过" },
    }), { status: 409 });

    await expect(requireApiOk(response)).rejects.toThrow("候选已经处理过");
  });

  it("uses a safe fallback when the response is not JSON", async () => {
    const response = new Response("", { status: 500 });

    await expect(requireApiOk(response)).rejects.toThrow("操作失败，请稍后重试");
  });
});
