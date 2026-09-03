import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "./dashboard-view";
import type { WorkspaceData } from "@/lib/workspace-types";

function makeData(): WorkspaceData {
  return {
    user: { id: "u1", displayName: "测试用户", username: "tester", role: "user" },
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
    simulations: [],
    drafts: [],
    templates: [],
    match: { score: 82, explanation: "整体匹配良好", weakAbilities: [] },
    recentProgressLogs: [],
    aiRuntime: { requestedMode: "mock", actualMode: "mock", degraded: false, fallbackReason: null, source: "runtime-config" },
    activeOnboardingConversation: null,
  };
}

describe("DashboardView 动效接入 (SSR)", () => {
  it("renders count-up values and radar chart without inline opacity", () => {
    const html = renderToStaticMarkup(
      <DashboardView data={makeData()} refresh={vi.fn(async () => undefined)} setNotice={vi.fn()} />,
    );
    expect(html).toContain("82");
    expect(html).toContain("能力雷达图");
    expect(html).not.toContain("opacity:0");
  });
});
