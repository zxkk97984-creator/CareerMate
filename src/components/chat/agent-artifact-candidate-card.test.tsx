import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentArtifactCandidateCard } from "./agent-artifact-candidate-card";

describe("AgentArtifactCandidateCard", () => {
  const defaultProps = {
    candidateId: "cand-1",
    candidateType: "career_plan" as const,
    taskType: "career_plan" as const,
    summary: "三年计划候选",
  };

  it("渲染摘要文本", () => {
    const html = renderToStaticMarkup(<AgentArtifactCandidateCard {...defaultProps} />);
    expect(html).toContain("三年计划候选");
  });

  it("渲染候选类型标签", () => {
    const html = renderToStaticMarkup(<AgentArtifactCandidateCard {...defaultProps} />);
    // 应包含类型标签（career_plan 显示为"职业计划"）
    expect(html).toContain("职业计划");
  });

  it("渲染接受和拒绝按钮", () => {
    const html = renderToStaticMarkup(<AgentArtifactCandidateCard {...defaultProps} />);
    expect(html).toContain("接受");
    expect(html).toContain("拒绝");
  });

  it("不将原始 JSON 渲染为 HTML", () => {
    const html = renderToStaticMarkup(<AgentArtifactCandidateCard {...defaultProps} />);
    // 不应包含未转义的 JSON 控制字符
    expect(html).not.toContain("&lt;script&gt;");
  });

  it("不同候选类型正确渲染", () => {
    const types = [
      { candidateType: "ability_evidence" as const, label: "能力证据" },
      { candidateType: "learning_route" as const, label: "学习路线" },
      { candidateType: "memory_item" as const, label: "记忆条目" },
    ];
    for (const { candidateType, label } of types) {
      const html = renderToStaticMarkup(
        <AgentArtifactCandidateCard {...defaultProps} candidateType={candidateType} />,
      );
      expect(html).toContain(label);
    }
  });
});
