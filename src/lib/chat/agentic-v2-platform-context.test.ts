import { describe, expect, it } from "vitest";
import { buildPlatformContextFields } from "./agentic-v2-platform-context";
import type { LoadAgenticV2SnapshotResult } from "./agentic-v2-snapshot";

function snapshot(overrides: Partial<LoadAgenticV2SnapshotResult> = {}): LoadAgenticV2SnapshotResult {
  return {
    profileSnapshot: {
      available: true,
      version: 3,
      data: { weeklyAvailableHours: 6, targetRole: "data_analyst" },
    },
    historySnapshot: {
      available: true,
      through: "2026-09-09T08:00:00+08:00",
      data: {
        activePlan: { id: "plan-1", version: 2 },
        activeLearningRoute: { id: "route-1", version: 4 },
      },
    },
    simulationState: null,
    jobSampleContext: null,
    currentTime: "2026-09-09T08:00:00+08:00",
    timezone: "Asia/Shanghai",
    contextCoverage: {
      algorithmVersion: "test",
      generatedAt: "2026-09-09T08:00:00+08:00",
      included: [],
      truncated: [],
      missing: [],
    },
    ...overrides,
  };
}

describe("platform workflow context", () => {
  it("provides general-chat context and the common evidence bundle for ordinary chat", () => {
    const fields = buildPlatformContextFields(snapshot(), {
      surface: "chat",
      action: "message_submit",
    });
    expect(fields.taskContext).toMatchObject({
      taskType: "general_chat",
      purpose: "read_only_report",
      source: "chat",
      activePlanId: "plan-1",
      basePlanVersion: 2,
      activeLearningRouteKnown: true,
      baseRouteVersion: 4,
    });
    expect(fields.evidenceBundle).toMatchObject({
      profileSnapshot: { version: 3 },
      historySnapshot: { available: true },
      verifiedAnalysis: {
        available: true,
        algorithmVersion: "careermate-skills-v1",
      },
    });
  });

  it("builds route version fields without inventing a version", () => {
    const fields = buildPlatformContextFields(snapshot(), {
      surface: "learning_route",
      action: "generate_route",
    });
    expect(fields.taskContext).toMatchObject({
      taskType: "learning_route",
      activeLearningRouteKnown: true,
      baseRouteVersion: 4,
      basePlanVersion: 2,
      weeklyBudgetHours: 6,
    });
  });

  it("marks a confirmed empty route as known and keeps baseRouteVersion null", () => {
    const fields = buildPlatformContextFields(snapshot({
      historySnapshot: {
        available: true,
        through: "2026-09-09T08:00:00+08:00",
        data: { activePlan: { id: "plan-1", version: 2 }, activeLearningRoute: null },
      },
    }), {
      surface: "learning_route",
      action: "generate_route",
    });

    expect(fields.taskContext).toMatchObject({
      taskType: "learning_route",
      activeLearningRouteKnown: true,
      baseRouteVersion: null,
      basePlanVersion: 2,
    });
  });

  it("marks a job action as local unverified sample and keeps the sanitized job", () => {
    const jobSampleContext = {
      source: "local_boss_sample" as const,
      sourceBatch: "boss-20260824",
      jobId: "job-1",
      title: "数据分析师",
      company: "示例公司",
      city: "上海",
      experience: "1-3年",
      education: "本科",
      salary: {
        raw: "10-15K",
        min: 10_000,
        max: 15_000,
        unit: "month" as const,
        months: null,
        comparable: true,
        note: "按月薪记录",
      },
      skills: ["SQL"],
      jd: "负责业务数据分析",
      collectedAt: "2026-08-24T00:00:00.000Z",
      collectionDateApprox: true,
      verificationStatus: "unverified" as const,
    };
    const fields = buildPlatformContextFields(
      snapshot({ jobSampleContext }),
      { surface: "resources", action: "analyze_job_gap", targetRef: "job-1" },
    );
    expect(fields.taskContext).toMatchObject({
      taskType: "career_exploration",
      source: "job_sample",
    });
    expect(fields.evidenceBundle).toMatchObject({
      jobSample: { jobId: "job-1", verificationStatus: "unverified" },
    });
  });
});
