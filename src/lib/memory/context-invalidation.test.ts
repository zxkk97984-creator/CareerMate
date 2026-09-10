import { describe, expect, it, vi } from "vitest";
import { invalidateMemoryContexts } from "./context-invalidation";

describe("invalidateMemoryContexts", () => {
  it("invalidates summaries and remote conversation bindings as well as the context version", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await invalidateMemoryContexts("user-1", {
      chatConversation: { updateMany },
    } as never);

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: { not: "deleted" } },
      data: {
        contextVersion: { increment: 1 },
        summary: "",
        lastSummarizedMessageId: null,
        remoteConversationId: null,
        remoteAgentId: null,
        remoteAgentVersion: null,
        remoteContextVersion: null,
      },
    });
  });
});
