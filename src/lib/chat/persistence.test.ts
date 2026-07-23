import { describe, expect, it } from "vitest";
import {
  chatMessagePartsSchema,
  parseChatMessageParts,
  titleFromFirstMessage,
} from "./persistence";

describe("chat persistence contracts", () => {
  it("accepts every supported structured message part", () => {
    const parts = [
      { type: "text", text: "先从目标岗位开始。" },
      {
        type: "citations",
        items: [
          {
            title: "职业标准",
            source: "人力资源和社会保障部",
            url: "https://example.com/standard",
            accessedAt: "2026-07-11",
            label: "实时联网调研",
          },
        ],
      },
      { type: "profile_candidate_ref", candidateId: "candidate-1" },
      { type: "plan_ref", planId: "plan-1", version: 2 },
      { type: "exploration_report_ref", reportId: "report-1" },
      { type: "error", code: "UPSTREAM_INTERRUPTED", message: "回答未完成，可以重试。" },
      {
        type: "agent_artifact_candidate_ref",
        candidateId: "cand-agent-1",
        candidateType: "career_plan",
        taskType: "career_plan",
        summary: "三年计划候选",
      },
    ];

    expect(chatMessagePartsSchema.parse(parts)).toEqual(parts);
  });

  it("rejects malformed agent_artifact_candidate_ref", () => {
    expect(parseChatMessageParts(JSON.stringify([
      {
        type: "agent_artifact_candidate_ref",
        candidateId: "",
        candidateType: "invalid",
        taskType: "career_plan",
        summary: "ok",
      },
    ]))).toEqual([]);
  });

  it("drops malformed persisted parts instead of breaking conversation history", () => {
    expect(parseChatMessageParts(JSON.stringify([
      { type: "text", text: "保留这一段" },
      { type: "plan_ref", planId: "" },
      { type: "unknown", value: true },
    ]))).toEqual([{ type: "text", text: "保留这一段" }]);
  });

  it("creates a short stable title from the first user message", () => {
    expect(titleFromFirstMessage("  我想了解人工智能产品经理这个职业，应该从哪里开始准备？  "))
      .toBe("我想了解人工智能产品经理这个职业，应该从哪里…");
  });
});
