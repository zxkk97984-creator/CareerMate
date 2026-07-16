import { describe, expect, it } from "vitest";
import { determineScope, type ContextBuilderInput } from "./context-builder";

function input(opts: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    profile: null,
    profileVersion: 1,
    memories: [],
    activePlan: null,
    conversation: {
      contextVersion: 1,
      summary: "",
      currentTask: { kind: "idle", status: "idle", answers: {} },
      awaitingQuestion: null,
      answeredQuestionKeys: [],
      recentMessages: opts.conversation?.recentMessages ?? [],
    },
    userMessage: "",
    ...opts,
  };
}

describe("determineScope — 通用职业表达模式", () => {
  it("我想当精算师 → career_full", () => {
    expect(determineScope(input({ userMessage: "我想当精算师" }))).toBe("career_full");
  });

  it("我想做宠物殡葬师 → career_full", () => {
    expect(determineScope(input({ userMessage: "我想做宠物殡葬师" }))).toBe("career_full");
  });

  it("我想成为工业设计师 → career_full", () => {
    expect(determineScope(input({ userMessage: "我想成为工业设计师" }))).toBe("career_full");
  });

  it("我的目标是当精算师 → career_full", () => {
    expect(determineScope(input({ userMessage: "我的目标是当精算师" }))).toBe("career_full");
  });

  it("打算转行做UI设计师 → career_full", () => {
    expect(determineScope(input({ userMessage: "我打算转行做UI设计师" }))).toBe("career_full");
  });

  it("今天天气怎么样 → general_minimal", () => {
    expect(determineScope(input({ userMessage: "今天天气怎么样" }))).toBe("general_minimal");
  });

  it("Python列表推导式是什么 → general_minimal", () => {
    expect(determineScope(input({ userMessage: "Python列表推导式是什么" }))).toBe("general_minimal");
  });

  it("历史中有职业信号 → career_full", () => {
    expect(determineScope(input({
      userMessage: "那大概需要多久",
      conversation: {
        contextVersion: 1,
        summary: "",
        currentTask: { kind: "idle", status: "idle", answers: {} },
        awaitingQuestion: null,
        answeredQuestionKeys: [],
        recentMessages: [
          { role: "user", content: "我想做宠物殡葬师" },
          { role: "assistant", content: "好的，让我帮你了解这个岗位..." },
        ],
      },
    }))).toBe("career_full");
  });

  it("我想学英语 → career_full（含学习意图模式）", () => {
    // "我想学" 匹配 careerIntentPatterns
    expect(determineScope(input({ userMessage: "我想学英语" }))).toBe("career_full");
  });

  it("删除我的数据 → privacy", () => {
    expect(determineScope(input({ userMessage: "删除我的数据" }))).toBe("privacy");
  });

  it("active task → career_full", () => {
    expect(determineScope(input({
      userMessage: "好的",
      conversation: {
        contextVersion: 1,
        summary: "",
        currentTask: { kind: "profile_guidance", status: "collecting", answers: {}, goal: "测试" },
        awaitingQuestion: null,
        answeredQuestionKeys: [],
        recentMessages: [],
      },
    }))).toBe("career_full");
  });
});
