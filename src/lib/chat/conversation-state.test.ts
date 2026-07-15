import { describe, expect, it } from "vitest";
import { parseConversationState, defaultConversationState } from "./conversation-state";

describe("defaultConversationState", () => {
  it("returns idle state", () => {
    const state = defaultConversationState();
    expect(state.schemaVersion).toBe(1);
    expect(state.currentTask.kind).toBe("idle");
    expect(state.currentTask.status).toBe("idle");
    expect(state.awaitingQuestion).toBeNull();
  });
});

describe("parseConversationState", () => {
  it("parses valid JSON state", () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      currentTask: { kind: "profile_guidance", status: "collecting", answers: {} },
      awaitingQuestion: null,
    });
    const state = parseConversationState(json);
    expect(state.schemaVersion).toBe(1);
    expect(state.currentTask.kind).toBe("profile_guidance");
    expect(state.currentTask.status).toBe("collecting");
  });

  it("parses state with awaitingQuestion", () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      currentTask: { kind: "general", status: "idle", answers: { "profile:targetRole": "DBA" } },
      awaitingQuestion: {
        id: "q1",
        normalizedKey: "profile:targetRole",
        text: "你的目标岗位是什么？",
        profileField: "targetRole",
        answerKind: "free_text",
        actions: [{ id: "a1", label: "DBA", value: "DBA" }],
        askedAt: "2026-07-15T00:00:00Z",
      },
    });
    const state = parseConversationState(json);
    expect(state.awaitingQuestion).not.toBeNull();
    expect(state.awaitingQuestion!.normalizedKey).toBe("profile:targetRole");
    expect(state.awaitingQuestion!.actions).toHaveLength(1);
  });

  it("parses ConversationTask with goal", () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      currentTask: {
        kind: "plan_generation",
        status: "waiting_confirmation",
        goal: "生成DBA职业规划",
        answers: {},
      },
      awaitingQuestion: null,
    });
    const state = parseConversationState(json);
    expect(state.currentTask.kind).toBe("plan_generation");
    expect(state.currentTask.status).toBe("waiting_confirmation");
    expect(state.currentTask.goal).toBe("生成DBA职业规划");
  });

  it("falls back to idle on corrupted JSON", () => {
    const state = parseConversationState("{not valid json}");
    expect(state.schemaVersion).toBe(1);
    expect(state.currentTask.kind).toBe("idle");
    expect(state.currentTask.status).toBe("idle");
    expect(state.awaitingQuestion).toBeNull();
  });

  it("falls back to idle on null", () => {
    const state = parseConversationState(null as unknown as string);
    expect(state.currentTask.kind).toBe("idle");
  });

  it("falls back to idle on empty string", () => {
    const state = parseConversationState("");
    expect(state.currentTask.kind).toBe("idle");
  });

  it("falls back to idle on invalid schemaVersion", () => {
    const json = JSON.stringify({
      schemaVersion: 99,
      currentTask: { kind: "general", status: "idle", answers: {} },
    });
    const state = parseConversationState(json);
    expect(state.currentTask.kind).toBe("idle");
  });

  it("falls back when currentTask.kind is invalid", () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      currentTask: { kind: "invalid_task_kind", status: "idle", answers: {} },
    });
    const state = parseConversationState(json);
    expect(state.currentTask.kind).toBe("idle");
  });
});
