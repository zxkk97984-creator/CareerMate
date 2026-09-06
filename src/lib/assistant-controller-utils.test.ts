import { describe, expect, it } from "vitest";
import {
  beginSubscription,
  isCurrentSubscription,
  resolveClientRequestId,
  type RequestIdState,
} from "./assistant-controller-utils";

describe("resolveClientRequestId", () => {
  it("generates a new id for a fresh question", () => {
    const state: RequestIdState = { current: null, retrying: false };
    const id = resolveClientRequestId(state, false);
    expect(id).toBeTruthy();
    expect(id).not.toBe(null);
  });

  it("reuses the same id on retry so the server can dedupe (no duplicate turn/candidate)", () => {
    const state: RequestIdState = { current: "req-abc", retrying: true };
    // 同一逻辑发送的首次请求失败后重试，必须复用原 id
    expect(resolveClientRequestId(state, true)).toBe("req-abc");
    expect(resolveClientRequestId(state, true)).toBe("req-abc");
  });

  it("creates a new id only for a genuinely new question", () => {
    const state: RequestIdState = { current: "req-abc", retrying: false };
    const next = resolveClientRequestId(state, false);
    expect(next).not.toBe("req-abc");
  });
});

describe("subscription guard", () => {
  it("increments and lets only the current subscription write", () => {
    const guard = { seq: 0 };
    const subA = beginSubscription(guard);
    guard.seq = subA;
    expect(isCurrentSubscription(guard, subA)).toBe(true);

    // 用户切换到另一会话 → 新订阅，旧订阅失效
    const subB = beginSubscription(guard);
    guard.seq = subB;
    expect(isCurrentSubscription(guard, subA)).toBe(false);
    expect(isCurrentSubscription(guard, subB)).toBe(true);
  });

  it("blocks a stale subscription from overwriting the new conversation", () => {
    const guard = { seq: 0 };
    const oldSub = beginSubscription(guard);
    guard.seq = oldSub; // 旧流开始
    const newSub = beginSubscription(guard);
    guard.seq = newSub; // 切到新会话
    // 旧的加增量回调即使触发也因不是当前订阅而被丢弃
    expect(isCurrentSubscription(guard, oldSub)).toBe(false);
  });
});
