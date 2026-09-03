import { describe, expect, it } from "vitest";
import { createOnboardingInitialState, onboardingGreeting } from "./onboarding-resume";

describe("createOnboardingInitialState", () => {
  it("resumes the latest active conversation after refresh", () => {
    expect(createOnboardingInitialState({
      id: "conversation-1",
      status: "active",
      transcript: [
        { role: "user", content: "我是大三" },
        { role: "assistant", content: "你的专业是什么？" },
      ],
      draft: { educationStage: "junior" },
      completeness: 1 / 7,
      executionMeta: {
        requestedMode: "manual",
        actualMode: "manual",
        degraded: false,
        fallbackReason: null,
        source: "manual-fixture",
      },
    })).toMatchObject({
      conversationId: "conversation-1",
      messages: [
        { role: "user", content: "我是大三" },
        { role: "assistant", content: "你的专业是什么？" },
      ],
      draft: { educationStage: "junior" },
      completeness: 1 / 7,
    });
  });

  it("uses the greeting when there is no active conversation", () => {
    expect(createOnboardingInitialState(null)).toEqual({
      conversationId: undefined,
      draft: {},
      completeness: 0,
      messages: [{ role: "assistant", content: onboardingGreeting }],
    });
  });
});
