import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "./dashboard-view";
import { buildDashboard } from "@/lib/dashboard/model";
import type { WorkspaceData } from "@/lib/workspace-types";

function makeData(): WorkspaceData {
  return {
    user: { id: "u1", displayName: "测试用户", username: "tester", avatarDataUrl: null, role: "user" },
    profile: {
      id: "p1",
      userId: "u1",
      educationStage: null,
      major: "软件工程",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 10,
      learningPreference: [],
      experienceSummary: "",
      interestTags: [],
      constraints: [],
      abilityScores: { dataAnalysis: 72, aiTooling: 60 },
      memoryEnabled: true,
      onboardingCompleted: true,
      version: 1,
      introStatus: "done",
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    plan: {
      id: "plan-1",
      targetRole: "data_analyst",
      version: 1,
      status: "active",
      years: [],
      quarters: [],
      months: [],
      currentMonthIndex: 1,
      assumptions: [],
      riskNotes: [],
      generationMeta: {
        requestedMode: "mock",
        actualMode: "mock",
        degraded: false,
        fallbackReason: null,
        source: "runtime-config",
        triggeredBy: "manual",
      },
      sourceReportId: null,
      schemaVersion: 1,
      content: null,
      targetRoleLabel: "数据分析师",
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    pendingPlan: null,
    planExecutionMeta: null,
    resources: [],
    memories: [],
    candidates: [],
    v2Candidates: [],
    v2CandidateTotal: 0,
    simulations: [],
    drafts: [],
    templates: [],
    match: { score: 82, explanation: "整体匹配良好", weakAbilities: [] },
    recentProgressLogs: [],
    aiRuntime: { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "runtime-config" },
    activeOnboardingConversation: null,
  };
}

function dashboard(data: WorkspaceData) {
  return buildDashboard({ profile: data.profile, plan: data.plan ? { id: data.plan.id, tasks: data.plan.tasks ?? [] } : null, pendingPlan: data.pendingPlan, match: data.match, candidateCount: 0, evidence: [] });
}

describe("DashboardView (SSR)", () => {
  it("renders loading and failure states without fabricated metrics", () => {
    const props = { dashboard: null, refresh: vi.fn(async () => undefined), setNotice: vi.fn() };
    expect(renderToStaticMarkup(<DashboardView {...props} loading />)).toContain("正在整理你的成长进度");
    const failed = renderToStaticMarkup(<DashboardView {...props} error="读取失败" />);
    expect(failed).toContain("重新加载");
    expect(failed).not.toContain("0%");
  });
  it("uses expandable task details and disables mutations while data is stale", () => {
    const result = dashboard(makeData());
    const html = renderToStaticMarkup(<DashboardView dashboard={result} error="读取失败" refresh={vi.fn(async () => undefined)} setNotice={vi.fn()} />);
    expect(html).toContain("上次加载的数据");
    expect(html).toContain('disabled=""');
    expect(html).toContain("近期安排");
    expect(html).not.toContain("本周安排");
  });
  it("renders evidence-based scores without hiding content on first paint", () => {
    const html = renderToStaticMarkup(
      <DashboardView dashboard={dashboard(makeData())} refresh={vi.fn(async () => undefined)} setNotice={vi.fn()} />,
    );
    expect(html).toContain("82");
    expect(html).toContain("能力与成长");
    expect(html).not.toContain("opacity:0");
  });

  it("does not draw missing ability dimensions as zero scores", () => {
    const data = makeData();
    data.profile!.abilityScores = {};
    const html = renderToStaticMarkup(
      <DashboardView dashboard={dashboard(data)} refresh={vi.fn(async () => undefined)} setNotice={vi.fn()} />,
    );

    expect(html).not.toContain("value=\"0\"");
    expect(html).toContain("待评估");
  });
});
