import { describe, expect, it } from "vitest";
import {
  agentResponseSchema,
  agentQuestionSchema,
  agentOperationSchema,
  agentSourceRefSchema,
  quickActionSchema,
  AGENT_INTENTS,
} from "./agent-protocol";

describe("agentResponseSchema", () => {
  it("accepts minimal valid response", () => {
    const result = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [],
      sourceRefs: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects schemaVersion != 1", () => {
    const result = agentResponseSchema.safeParse({
      schemaVersion: 2,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [],
      sourceRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing schemaVersion", () => {
    const result = agentResponseSchema.safeParse({
      intent: "general",
      task: { kind: "general", status: "idle" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects intent outside enum", () => {
    const result = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "unknown_intent",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [],
      sourceRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("allows all valid intents", () => {
    for (const intent of AGENT_INTENTS) {
      const result = agentResponseSchema.safeParse({
        schemaVersion: 1,
        intent,
        task: { kind: "general", status: "idle" },
        questions: [],
        operations: [],
        sourceRefs: [],
      });
      expect(result.success).toBe(true);
    }
  });

  it("questions max 1 item", () => {
    const two = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [
        { id: "q1", normalizedKey: "test:one", text: "Q1", answerKind: "free_text", actions: [] },
        { id: "q2", normalizedKey: "test:two", text: "Q2", answerKind: "free_text", actions: [] },
      ],
      operations: [],
      sourceRefs: [],
    });
    expect(two.success).toBe(false);

    const one = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [
        { id: "q1", normalizedKey: "test:one", text: "Q1", answerKind: "free_text", actions: [] },
      ],
      operations: [],
      sourceRefs: [],
    });
    expect(one.success).toBe(true);
  });

  it("rejects operations with type passwordHash", () => {
    const result = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [
        {
          id: "op1",
          type: "profile_patch",
          patch: { passwordHash: "secret" },
          sourceKind: "explicit",
          confidence: 0.8,
          evidenceExcerpt: "...",
          reason: "...",
          sensitive: false,
        },
      ],
      sourceRefs: [],
    });
    // Sensitive field patch should be rejected by the operation discriminator
    expect(result.success).toBe(false);
  });

  it("rejects null operation", () => {
    const result = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [null],
      sourceRefs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects operations with unknown type", () => {
    const result = agentResponseSchema.safeParse({
      schemaVersion: 1,
      intent: "general",
      task: { kind: "general", status: "idle" },
      questions: [],
      operations: [{ id: "x", type: "delete_everything" }],
      sourceRefs: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("agentQuestionSchema", () => {
  it("accepts valid question", () => {
    const result = agentQuestionSchema.safeParse({
      id: "q1",
      normalizedKey: "profile:target_role",
      text: "你的目标岗位是什么？",
      profileField: "targetRole",
      answerKind: "free_text",
      actions: [
        { id: "a1", label: "DBA", value: "DBA" },
        { id: "a2", label: "UX设计师", value: "UX设计师" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid normalizedKey format", () => {
    const result = agentQuestionSchema.safeParse({
      id: "q1",
      normalizedKey: "invalid key with spaces!",
      text: "Q1",
      answerKind: "free_text",
      actions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid answerKind", () => {
    const result = agentQuestionSchema.safeParse({
      id: "q1",
      normalizedKey: "test:key",
      text: "Q1",
      answerKind: "invalid_kind" as never,
      actions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("agentSourceRefSchema", () => {
  it("accepts citation ref", () => {
    const result = agentSourceRefSchema.safeParse({
      id: "ref1",
      kind: "citation",
      citationIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts ai_inference ref without citationIndex", () => {
    const result = agentSourceRefSchema.safeParse({
      id: "ref2",
      kind: "ai_inference",
      note: "基于通用知识推断",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid kind", () => {
    const result = agentSourceRefSchema.safeParse({
      id: "ref3",
      kind: "made_up",
    });
    expect(result.success).toBe(false);
  });
});

describe("agentOperationSchema - profile_patch", () => {
  it("accepts explicit educationStage patch", () => {
    const result = agentOperationSchema.safeParse({
      id: "op1",
      type: "profile_patch",
      patch: { educationStage: "sophomore" },
      sourceKind: "explicit",
      confidence: 1.0,
      evidenceExcerpt: "我是大二的学生",
      reason: "用户明确表述",
      sensitive: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts inferred targetRole patch (requires confirmation)", () => {
    const result = agentOperationSchema.safeParse({
      id: "op2",
      type: "profile_patch",
      patch: { targetRole: { key: "database_administrator", label: "数据库管理员（DBA）" } },
      sourceKind: "inferred",
      confidence: 0.7,
      evidenceExcerpt: "我想做数据库运维方面的",
      reason: "语义推断",
      sensitive: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects profile_patch with forbidden field", () => {
    const result = agentOperationSchema.safeParse({
      id: "op3",
      type: "profile_patch",
      patch: { passwordHash: "abc", ssn: "123" },
      sourceKind: "explicit",
      confidence: 1.0,
      evidenceExcerpt: "...",
      reason: "...",
      sensitive: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("agentOperationSchema - memory_proposal", () => {
  it("accepts valid memory proposal", () => {
    const result = agentOperationSchema.safeParse({
      id: "op_mem",
      type: "memory_proposal",
      content: "用户每周只能学习10小时",
      kind: "constraint",
      sourceKind: "explicit_remember",
      confidence: 0.95,
      reason: "用户明确要求记住",
      sensitive: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("agentOperationSchema - plan_draft", () => {
  it("accepts valid plan_draft with V2 plan", () => {
    const result = agentOperationSchema.safeParse({
      id: "op_plan",
      type: "plan_draft",
      plan: {
        schemaVersion: 2,
        title: "DBA 学习路线",
        targetRole: { key: "database_administrator", label: "数据库管理员（DBA）" },
        summary: "6个月转行计划",
        horizon: { value: 6, unit: "month" },
        phases: [
          {
            id: "phase1",
            title: "基础巩固",
            objective: "掌握SQL和数据库原理",
            duration: { value: 2, unit: "month" },
            skills: ["SQL", "数据库原理"],
            actions: [
              {
                id: "act1",
                title: "完成SQL进阶课程",
                description: "学习复杂查询和优化",
                type: "learning",
                status: "not_started",
                resources: [],
              },
            ],
            outputs: ["SQL能力达到中级"],
            evaluationCriteria: ["通过在线测试"],
            risks: [],
          },
        ],
        immediateActions: [],
        assumptions: [],
        riskNotes: [],
        evidenceRefs: [],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("AGENT_INTENTS", () => {
  it("contains exactly the 7 defined intents", () => {
    expect(AGENT_INTENTS).toEqual([
      "career_advice",
      "career_research",
      "profile_guidance",
      "plan_generation",
      "plan_revision",
      "general",
      "privacy",
    ]);
  });
});
