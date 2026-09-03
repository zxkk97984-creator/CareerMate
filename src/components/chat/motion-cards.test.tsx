import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentArtifactCandidateCard } from "./agent-artifact-candidate-card";
import { ExplorationReportCard } from "./exploration-report-card";
import { MemoryProposalCard } from "./memory-proposal-card";
import { PlanSummaryCard } from "./plan-summary-card";
import { ProfileCandidateCard } from "./profile-candidate-card";

describe("候选卡 (SSR 冒烟:全部渲染可见)", () => {
  it("AgentArtifactCandidateCard", () => {
    const html = renderToStaticMarkup(
      <AgentArtifactCandidateCard candidateId="c1" candidateType="profile_patch" taskType="profile_assessment" summary="补充证据" />,
    );
    expect(html).toContain("补充证据");
    expect(html).not.toContain("opacity:0");
  });

  it("ProfileCandidateCard", () => {
    const html = renderToStaticMarkup(
      <ProfileCandidateCard
        candidate={{
          id: "c1",
          field: "major",
          oldValue: "计算机",
          newValue: "软件工程",
          confidence: 0.9,
          reason: "依据聊天",
          status: "pending",
          evidenceExcerpt: "聊天记录",
          impactSummary: "画像更准确",
        }}
        onAction={vi.fn(async () => undefined)}
      />,
    );
    expect(html).toContain("软件工程");
  });

  it("PlanSummaryCard", () => {
    const html = renderToStaticMarkup(
      <PlanSummaryCard
        plan={{
          id: "p1",
          targetRole: "data_analyst",
          version: 1,
          status: "active",
          months: [],
          currentMonthIndex: 1,
          generationMeta: { triggeredBy: "user" },
        }}
        diff={null}
        onAcceptReplan={vi.fn(async () => undefined)}
        onViewPlan={vi.fn()}
      />,
    );
    expect(html).toContain("执行本月计划");
  });

  it("MemoryProposalCard", () => {
    const html = renderToStaticMarkup(
      <MemoryProposalCard
        memoryId="m1"
        content="每周学习 10 小时"
        kind="career_fact"
        sensitivity="normal"
        status="pending"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(html).toContain("每周学习 10 小时");
  });

  it("ExplorationReportCard", () => {
    const html = renderToStaticMarkup(
      <ExplorationReportCard
        report={{
          id: "r1",
          roleName: "数据分析师",
          status: "draft",
          summary: "行业需求旺盛",
          coreCompetencies: ["SQL"],
          entryPaths: ["实习"],
          learningSuggestions: ["刷题"],
          fitAnalysis: ["匹配度较高"],
          sources: [],
        }}
        sourceLabel="AI分析与推断"
        onSubmit={vi.fn(async () => undefined)}
      />,
    );
    expect(html).toContain("行业需求旺盛");
  });
});
