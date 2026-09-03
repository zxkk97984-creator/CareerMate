/**
 * 七工作流完整契约矩阵测试
 *
 * 覆盖每个工作流的完整流水线：
 *   平台工作流真实 JSON → CAREERMATE_ARTIFACT → envelope parse
 *   → validatedAgentArtifactV1Schema → ingestion → candidate create
 *   → accept → 投影验证（mock Prisma 写入）
 */
import { describe, expect, it, vi } from "vitest";
import { parseAgentArtifactEnvelope } from "./artifact-envelope";
import { validatedAgentArtifactV1Schema } from "./contracts";
import { ingestAgentArtifact } from "./candidate-ingestion";
import { createAgentArtifactCandidateService } from "./candidate-service";
import { resolveAgentArtifactCandidate } from "./candidate-resolution";

// ── 辅助函数 ──────────────────────────────────────────
function wrapInEnvelope(artifact: Record<string, unknown>): string {
  return `这是给用户看的分析结果。\n<CAREERMATE_ARTIFACT>\n${JSON.stringify(artifact)}\n</CAREERMATE_ARTIFACT>`;
}

function makeCandidateService() {
  const rows = new Map<string, unknown>();
  return {
    service: createAgentArtifactCandidateService({
      db: {
        $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
          const tx = {
            chatConversation: { findFirst: vi.fn().mockResolvedValue({ id: "conv-1" }) },
            agentArtifactCandidate: {
              upsert: vi.fn().mockImplementation(async (args: {
                where: { userId_sourceSessionId_idempotencyKey: Record<string, string> };
                create: Record<string, unknown>;
              }) => {
                const key = JSON.stringify(args.where.userId_sourceSessionId_idempotencyKey);
                const existing = rows.get(key);
                if (existing) return existing;
                const created = { id: `cand-${rows.size + 1}`, ...args.create };
                rows.set(key, created);
                return created;
              }),
            },
          };
          return cb(tx);
        }),
      } as never,
    }),
    rows,
    context: {
      sessionId: "matrix-session-1", conversationId: "conv-1", idempotencyKey: "matrix-req-1",
    },
  };
}

/** 创建统一的 resolution mock tx——所有 mock 函数在 $transaction 内外共用 */
function makeResolutionTx(
  candidateType: string,
  artifact: Record<string, unknown>,
  profileMock: { version: number; abilityScores?: string } | null,
  overrides: {
    planVersion?: number;
    planFindFirst?: ReturnType<typeof vi.fn>;
    roleDraftCreate?: ReturnType<typeof vi.fn>;
    careerPlanCreate?: ReturnType<typeof vi.fn>;
    learningRouteCreate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const planVersion = overrides.planVersion ?? 3;
  const updMany = vi.fn().mockResolvedValue({ count: 1 });
  const evidenceCreate = vi.fn().mockResolvedValue({});
  const planCreate = overrides.careerPlanCreate ?? vi.fn().mockResolvedValue({ id: "plan-new" });
  const planFind = overrides.planFindFirst ?? vi.fn().mockResolvedValue({ id: "plan-1", version: planVersion });
  const draftCreate = overrides.roleDraftCreate ?? vi.fn().mockResolvedValue({});
  const lrCreate = overrides.learningRouteCreate ?? vi.fn().mockResolvedValue({ id: "lr-new" });
  const lrFind = vi.fn().mockResolvedValue(null); // no existing route by default
  const lrUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const memCreate = vi.fn().mockResolvedValue({});
  const progressCreate = vi.fn().mockResolvedValue({});
  const profileUpdate = vi.fn().mockResolvedValue({});

  const baseFindFirst = vi.fn().mockResolvedValue({
    id: "cand-1", userId: "u1", candidateType, status: "pending",
    artifact: JSON.stringify(artifact),
    baseVersion: (artifact as Record<string, unknown>).baseVersion ?? null,
    sourceSessionId: "s1", sourceConversationId: "c1", resolvedAt: null,
  });

  // 内层 tx——所有 mock 共享同一引用
  const innerTx = {
    agentArtifactCandidate: {
      findFirst: baseFindFirst,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    careerPlan: {
      findFirst: planFind,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: planCreate,
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue(profileMock),
      update: profileUpdate,
      updateMany: updMany,
    },
    abilityEvidence: { create: evidenceCreate },
    memoryItem: { create: memCreate },
    roleDraft: { create: draftCreate },
    progressLog: { create: progressCreate },
    learningRoute: {
      findFirst: lrFind,
      updateMany: lrUpdateMany,
      create: lrCreate,
    },
  };

  return {
    ...innerTx,
    $transaction: vi.fn().mockImplementation((fn: (tx: typeof innerTx) => unknown) => fn(innerTx)),
    // 暴露底层 mock 供断言使用
    _mocks: { updMany, evidenceCreate, planCreate, planFind, draftCreate, lrCreate, lrFind, lrUpdateMany, memCreate, progressCreate, profileUpdate },
  };
}

// ── 1. profile_assessment 完整流水线 ────────────────
describe("契约矩阵", () => {
  it("1. profile_assessment: 平台 JSON → envelope → schema → ingest → accept → CAS 投影", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "profile_assessment", status: "pending_confirmation",
      summary: "画像综合评估：沟通能力突出",
      data: {
        patch: { experienceSummary: "有 2 年产品实习经验" },
        abilityEvidence: [{
          abilityKey: "communication", summary: "用户访谈中沟通优秀",
          sourceType: "assessment", confidence: 0.88,
        }],
        scores: {
          communication: { value: 82, evidence: "用户访谈观察", confidence: 0.85 },
          roleFoundation: { value: 68, evidence: "PRD 评审", confidence: 0.72 },
        },
        strengths: ["沟通表达"], gaps: ["数据分析不足"],
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 3, nextActions: [],
    };

    // Step 1-2: 信封解析 + Schema 校验
    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    // Step 3: 摄入
    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-pa-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("profile_assessment");

    // Step 4: 接受 → 验证 CAS 投影
    const tx = makeResolutionTx("profile_assessment", platformJson, { version: 3, abilityScores: "{}" });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");
    expect(tx._mocks.updMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "u1", version: 3 },
      data: expect.objectContaining({
        experienceSummary: "有 2 年产品实习经验",
        abilityScores: JSON.stringify({ communication: 82, roleFoundation: 68 }),
        version: { increment: 1 },
      }),
    }));
    expect(tx._mocks.evidenceCreate).toHaveBeenCalledTimes(3);
  });

  it("2. career_exploration → draft: roleKey+roleName → 创建 career_template_draft", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "career_exploration", status: "pending_confirmation",
      summary: "推荐 AI 产品经理方向",
      data: {
        options: [{ roleName: "AI 产品经理", roleKey: "ai_product_manager", fitScore: 85 }],
        roleKey: "ai_product_manager", roleName: "AI 产品经理",
        category: "产品", reason: "用户适合该方向",
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: null, nextActions: [],
    };

    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-ce-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("career_template_draft");

    // 接受 → RoleDraft 投影
    const draftCreateFn = vi.fn().mockResolvedValue({});
    const tx = makeResolutionTx("career_template_draft", platformJson, null, { roleDraftCreate: draftCreateFn });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");
    expect(draftCreateFn).toHaveBeenCalledTimes(1);
    const draftData = draftCreateFn.mock.calls[0][0].data;
    expect(draftData.roleKey).toBe("ai_product_manager");
    expect(draftData.roleName).toBe("AI 产品经理");
  });

  it("3. career_plan: 完整计划 → envelope → schema → ingest → accept → CareerPlan", async () => {
    // 使用与 artifact-envelope.test.ts validArtifact 一致的最小 plan 结构
    const platformJson = {
      schemaVersion: "1.0", taskType: "career_plan", status: "pending_confirmation",
      summary: "三年计划候选",
      data: {
        plan: {
          schemaVersion: 2, title: "数据分析师计划",
          targetRole: { key: "data_analyst", label: "数据分析师" },
          summary: "三年成长为资深数据分析师", horizon: { value: 3, unit: "year" },
          phases: [{ id: "p1", title: "阶段一", objective: "入门", duration: { value: 6, unit: "month" }, skills: [], actions: [{ id: "a1", title: "学SQL", description: "基础", type: "learning", status: "not_started", resources: [] }], outputs: [], evaluationCriteria: [], risks: [] }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        },
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 3, nextActions: [],
    };

    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(envelope.warnings).toEqual([]);
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-cp-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("career_plan");

    const planCreateFn = vi.fn().mockResolvedValue({ id: "plan-new" });
    const tx = makeResolutionTx("career_plan", platformJson, null, { careerPlanCreate: planCreateFn });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");
    expect(planCreateFn).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        targetRole: "data_analyst", status: "active", schemaVersion: 2,
      }),
    }));
  });

  it("4. learning_route: 路线 → envelope → schema → ingest → accept → LearningRoute 模型", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "learning_route", status: "pending_confirmation",
      summary: "AI 产品经理 12 周学习路线",
      data: {
        targetRole: "ai_product_manager", weeklyBudgetHours: 8, period: "12 周",
        stages: [
          { title: "产品基础", description: "PRD入门", deliverables: ["2份PRD"], tasks: [{ title: "PRD课程", week: 1 }] },
          { title: "AI工具链", description: "AI工具", deliverables: ["评估报告"], tasks: [{ title: "AI调研", week: 3 }] },
        ],
        tasks: [],
        resources: [{ title: "产品课", type: "course" }],
        deliverables: ["学习笔记仓库"],
        acceptanceCriteria: ["能独立写PRD"],
        adjustmentTriggers: ["连续2周未完成"],
        baseRouteVersion: null,
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 3, nextActions: [],
    };

    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-lr-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("learning_route");

    // 验证写入 LearningRoute 而非 CareerPlan
    const lrCreateFn = vi.fn().mockResolvedValue({ id: "lr-1" });
    const planCreateFn = vi.fn().mockResolvedValue({ id: "plan-new" });
    const tx = makeResolutionTx("learning_route", platformJson, null, {
      learningRouteCreate: lrCreateFn,
      careerPlanCreate: planCreateFn,
    });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");

    // LearningRoute 创建——不得写 CareerPlan
    expect(lrCreateFn).toHaveBeenCalledTimes(1);
    expect(planCreateFn).not.toHaveBeenCalled();

    // 验证 LearningRoute 内容完整
    const lrData = lrCreateFn.mock.calls[0][0].data;
    expect(lrData.userId).toBe("u1");
    expect(lrData.status).toBe("active");
    expect(lrData.relatedPlanId).toBe("plan-1");
    expect(lrData.basePlanVersion).toBe(3);
    const content = JSON.parse(lrData.content);
    expect(content.schemaVersion).toBe(1);
    expect(content.targetRole).toBe("ai_product_manager");
    expect(content.stages).toHaveLength(2);
    expect(content.resources).toHaveLength(1);
    expect(content.deliverables).toHaveLength(1);
    expect(content.acceptanceCriteria).toHaveLength(1);
    expect(content.adjustmentTriggers).toHaveLength(1);

    // 旧 LearningRoute 被归档
    expect(tx._mocks.lrUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "active" },
      data: { status: "inactive" },
    });
    // CareerPlan 不被归档
    expect(tx.careerPlan.updateMany).not.toHaveBeenCalled();
  });

  it("5. simulation_report: 证据 → envelope → schema → ingest → accept → AbilityEvidence", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "simulation_report", status: "pending_confirmation",
      summary: "训练报告",
      data: {
        abilityEvidence: [
          { abilityKey: "communication", summary: "协调能力优秀", sourceType: "simulation", sourceRef: "sim-1", confidence: 0.85 },
          { abilityKey: "businessProduct", summary: "业务分析好", sourceType: "simulation", sourceRef: "sim-1", confidence: 0.78 },
        ],
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 3, nextActions: [],
    };

    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-sr-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("ability_evidence");

    const tx = makeResolutionTx("ability_evidence", platformJson, { version: 3 });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");
    expect(tx._mocks.evidenceCreate).toHaveBeenCalledTimes(2);
  });

  it("6. resume_review: 简历评估 → envelope → schema → ingest → accept → AbilityEvidence", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "resume_review", status: "pending_confirmation",
      summary: "简历评估",
      data: {
        abilityEvidence: [{
          abilityKey: "projectPractice", summary: "3个完整原型展现实践能力",
          sourceType: "resume", confidence: 0.92,
        }],
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 3, nextActions: [],
    };

    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-rr-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("ability_evidence");

    const tx = makeResolutionTx("ability_evidence", platformJson, { version: 3 });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");
    expect(tx._mocks.evidenceCreate).toHaveBeenCalledTimes(1);
  });

  it("7. growth_review: 复盘 → envelope → schema → ingest → accept → CareerPlan(replan)", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "growth_review", status: "pending_confirmation",
      summary: "季度复盘",
      data: {
        plan: {
          schemaVersion: 2, title: "调整后计划",
          targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
          summary: "调整学习节奏", horizon: { value: 2, unit: "year" },
          phases: [{
            id: "phase-2", title: "进阶期", objective: "提升设计能力",
            duration: { value: 6, unit: "month" }, skills: ["交互设计"],
            actions: [{
              id: "a1", title: "设计思维工作坊", description: "学方法论",
              type: "learning", status: "not_started", resources: [],
            }],
            outputs: [], evaluationCriteria: [], risks: [],
          }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        },
        planPatch: { parentPlanId: "plan-old-1" },
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 3, nextActions: [],
    };

    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(envelope.artifact).success).toBe(true);

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-gr-1", artifact: envelope.artifact }, service,
    );
    expect(r.candidate?.candidateType).toBe("growth_replan");

    const planCreateFn = vi.fn().mockResolvedValue({ id: "plan-new" });
    const tx = makeResolutionTx("growth_replan", platformJson, null, { careerPlanCreate: planCreateFn });
    const res = await resolveAgentArtifactCandidate(
      { userId: "u1", candidateId: "cand-1", decision: "accept" }, { db: tx as never },
    );
    expect(res.status).toBe("accepted");
    expect(planCreateFn).toHaveBeenCalledTimes(1);
    expect(planCreateFn.mock.calls[0][0].data.parentPlanId).toBe("plan-old-1");
    expect(planCreateFn.mock.calls[0][0].data.targetRole).toBe("ai_product_manager");
  });
});

// ── Schema 契约边界测试 ────────────────
describe("Schema 契约边界", () => {
  it("profile_assessment 空 abilityEvidence 数组被拒绝", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "profile_assessment", status: "pending_confirmation",
      summary: "空证据", data: { abilityEvidence: [], scores: { aiTooling: { value: 50, evidence: "测试" } } },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 1, nextActions: [],
    });
    expect(r.success).toBe(false);
  });

  it("profile_assessment 空 scores 对象被拒绝", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "profile_assessment", status: "pending_confirmation",
      summary: "空分数", data: { patch: { experienceSummary: "x" }, scores: {} },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 1, nextActions: [],
    });
    expect(r.success).toBe(false);
  });

  it("abilityEvidence 使用无效 abilityKey 被拒绝", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "simulation_report", status: "pending_confirmation",
      summary: "无效键", data: {
        abilityEvidence: [{ abilityKey: "leadership", summary: "测试", sourceType: "simulation", confidence: 0.8 }],
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: 1, nextActions: [],
    });
    expect(r.success).toBe(false);
  });

  it("error 状态空对象被拒绝（需要 message 或 code）", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "career_plan", status: "error",
      summary: "错误", data: {},
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: false, baseVersion: null, nextActions: [],
    });
    expect(r.success).toBe(false);
  });

  it("error 状态带 message 通过", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "career_plan", status: "error",
      summary: "错误", data: { message: "服务暂时不可用" },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: false, baseVersion: null, nextActions: [],
    });
    expect(r.success).toBe(true);
  });

  it("pending_confirmation + requiresUserConfirmation=false 被拒绝", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "career_plan", status: "pending_confirmation",
      summary: "测试", data: {
        plan: {
          schemaVersion: 2, title: "测试", targetRole: { key: "ai_product_manager", label: "PM" },
          summary: "测试", horizon: { value: 1, unit: "year" },
          phases: [{ id: "p1", title: "阶段", objective: "", duration: { value: 1, unit: "month" },
            skills: [], actions: [], outputs: [], evaluationCriteria: [], risks: [] }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        },
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: false, baseVersion: 1, nextActions: [],
    });
    expect(r.success).toBe(false);
  });

  it("simulationReportSuccess 非法 abilityImpact 键被拒绝", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "simulation_report", status: "success",
      summary: "报告", data: {
        scenarioKey: "cross_role_communication", score: 85,
        strengths: ["好"], improvements: ["改进"], evidence: ["证据"],
        abilityImpact: { leadership: 10 }, candidateUpdates: [],
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: false, baseVersion: null, nextActions: [],
    });
    expect(r.success).toBe(false);
  });

  it("simulationReportSuccess 合法 abilityImpact 通过", () => {
    const r = validatedAgentArtifactV1Schema.safeParse({
      schemaVersion: "1.0", taskType: "simulation_report", status: "success",
      summary: "报告", data: {
        scenarioKey: "cross_role_communication", score: 85,
        strengths: ["沟通好"], improvements: ["需改进"], evidence: ["证据1"],
        abilityImpact: { communication: 15, businessProduct: 10 }, candidateUpdates: [],
      },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: false, baseVersion: null, nextActions: [],
    });
    expect(r.success).toBe(true);
  });

  it("career_exploration 无 roleKey+roleName 不创建候选", async () => {
    const platformJson = {
      schemaVersion: "1.0", taskType: "career_exploration", status: "pending_confirmation",
      summary: "职业探索结果", data: { options: [{ roleName: "数据分析师" }] },
      evidence: [], sources: [], assumptions: [], warnings: [],
      requiresUserConfirmation: true, baseVersion: null, nextActions: [],
    };
    const envelope = parseAgentArtifactEnvelope(wrapInEnvelope(platformJson));
    expect(envelope.artifact).toBeDefined();

    const { service, context } = makeCandidateService();
    const r = await ingestAgentArtifact(
      { userId: "u1", ...context, clientRequestId: "req-nodraft", artifact: envelope.artifact }, service,
    );
    expect(r.candidate).toBeUndefined();
  });
});
