import { describe, expect, it } from "vitest";
import { resolveBoundRemoteConversationId } from "./remote-conversation-binding";

describe("remote conversation binding", () => {
  const stored = {
    remoteConversationId: "remote-old",
    remoteAgentId: "agent-v1",
    remoteAgentVersion: "1.4",
  };

  it("reuses a remote conversation only for the exact agent and version", () => {
    expect(resolveBoundRemoteConversationId(stored, {
      agentId: "agent-v1",
      agentVersion: "1.4",
    })).toBe("remote-old");
  });

  it("starts a fresh remote conversation when switching forward to V2", () => {
    expect(resolveBoundRemoteConversationId(stored, {
      agentId: "agent-v2",
      agentVersion: "2.0",
    })).toBeUndefined();
  });

  it("starts a fresh remote conversation when rolling back to another binding", () => {
    expect(resolveBoundRemoteConversationId({
      remoteConversationId: "remote-v2",
      remoteAgentId: "agent-v2",
      remoteAgentVersion: "2.0",
    }, {
      agentId: "agent-v1",
      agentVersion: "1.4",
    })).toBeUndefined();
  });

  it("does not reuse legacy unbound remote ids", () => {
    expect(resolveBoundRemoteConversationId({
      remoteConversationId: "remote-legacy",
      remoteAgentId: null,
      remoteAgentVersion: null,
    }, {
      agentId: "agent-v2",
      agentVersion: "2.0",
    })).toBeUndefined();
  });

  it("treats an omitted current version as an exact null binding", () => {
    expect(resolveBoundRemoteConversationId({
      remoteConversationId: "remote-current",
      remoteAgentId: "agent-v2",
      remoteAgentVersion: null,
    }, {
      agentId: "agent-v2",
      agentVersion: undefined,
    })).toBe("remote-current");
  });
});
