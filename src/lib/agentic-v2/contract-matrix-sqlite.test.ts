/**
 * 真实 SQLite 集成测试——七工作流完整流水线 + 回归断言
 *
 * 使用临时 SQLite 数据库，完整覆盖：
 *   CAREERMATE_ARTIFACT envelope → validated schema → ingestAgentArtifact
 *   → candidate create → accept → Prisma 查询验证
 *
 * 与 contract-matrix.test.ts mock 测试互补。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { parseAgentArtifactEnvelope } from "./artifact-envelope";
import { validatedAgentArtifactV1Schema } from "./contracts";
import { ingestAgentArtifact } from "./candidate-ingestion";
import { createAgentArtifactCandidateService } from "./candidate-service";
import { resolveAgentArtifactCandidate } from "./candidate-resolution";
import { aiCareerPlanV2Schema } from "@/lib/plans/schema-v2";
import { buildPrivacyExport } from "@/lib/privacy";

const PRISMA_DIR = join(process.cwd(), "prisma");
let testDbPath: string;
let prisma: PrismaClient;

function seedUser(): Promise<{ id: string }> {
  const hash = createHash("sha256").update("test").digest("hex");
  return (prisma as any).user.create({
    data: {
      username: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      displayName: "集成测试",
      role: "user",
      passwordHash: hash,
      profile: {
        create: {
          targetRole: "ai_product_manager",
          targetRoleLabel: "AI 产品经理",
          weeklyAvailableHours: 8,
          abilityScores: JSON.stringify({ aiTooling: 50 }),
          version: 1,
        },
      },
    },
    select: { id: true },
  }) as Promise<{ id: string }>;
}

function wrap(artifact: Record<string, unknown>): string {
  return `结论如下。\n<CAREERMATE_ARTIFACT>\n${JSON.stringify(artifact)}\n</CAREERMATE_ARTIFACT>`;
}

function baseArtifact(taskType: string, data: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0", taskType, status: "pending_confirmation",
    summary: `测试 ${taskType}`,
    data,
    evidence: [], sources: [], assumptions: [], warnings: [],
    requiresUserConfirmation: true,
    baseVersion: (overrides.baseVersion as number) ?? 1,
    nextActions: [],
    ...overrides,
  };
}

beforeAll(async () => {
  testDbPath = join(PRISMA_DIR, `itest-${process.pid}-${Date.now()}.db`);
  // Match the E2E harness: initialize the empty SQLite file before schema push.
  writeFileSync(testDbPath, "", { flag: "wx" });
  const url = `file:${testDbPath}`;
  execSync(
    `npx prisma db push --skip-generate --accept-data-loss --schema="${join(PRISMA_DIR, "schema.prisma")}"`,
    { env: { ...process.env, DATABASE_URL: url, NODE_ENV: "development" }, stdio: "pipe", cwd: join(PRISMA_DIR, ".."), timeout: 60000 },
  );
  prisma = new PrismaClient({ datasources: { db: { url } } });
}, 120000);

afterAll(async () => {
  try { await prisma?.$disconnect(); } catch { /* ignore */ }
  if (existsSync(testDbPath)) {
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + "-wal"); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + "-shm"); } catch { /* ignore */ }
  }
});

// ═══════════════════════════════════════════════════════════
// 完整流水线测试（envelope → parse → schema → ingest → accept → Prisma）
// ═══════════════════════════════════════════════════════════

describe("契约矩阵 SQLite：七工作流完整流水线", () => {
  it("W1. profile_assessment: envelope→parse→ingest→accept→画像version+1, 证据可查", async () => {
    const u = await seedUser();
    const text = wrap(baseArtifact("profile_assessment", {
      patch: { experienceSummary: "测试经验" },
      abilityEvidence: [{ abilityKey: "communication", summary: "沟通测试", sourceType: "assessment", confidence: 0.85 }],
      scores: { communication: { value: 78, evidence: "测试观察" } },
      strengths: ["沟通力"], gaps: [],
    }));

    // envelope parse
    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(env.artifact).success).toBe(true);

    // ingestion via real service → candidate
    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s1",
      clientRequestId: `w1-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("profile_assessment");

    // accept
    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    // Prisma 验证
    const prof = await (prisma as any).userProfile.findUnique({ where: { userId: u.id } });
    expect(prof.version).toBe(2);
    expect(JSON.parse(prof.abilityScores).communication).toBe(78);
    const ev = await prisma.abilityEvidence.findMany({ where: { userId: u.id } });
    expect(ev.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it("W2. career_exploration: envelope→parse→ingest(roleKey+roleName)→accept→RoleDraft", async () => {
    const u = await seedUser();
    const text = wrap(baseArtifact("career_exploration", {
      options: [{ roleName: "AI 产品经理", roleKey: "ai_product_manager", fitScore: 85 }],
      roleKey: "ai_product_manager", roleName: "AI 产品经理", category: "产品", reason: "匹配度高",
    }, { baseVersion: null }));

    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(env.artifact).success).toBe(true);

    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s2",
      clientRequestId: `w2-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("career_template_draft");

    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    const drafts = await prisma.roleDraft.findMany({ where: { roleKey: "ai_product_manager" } });
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts.some((d) => d.roleName === "AI 产品经理")).toBe(true);
  }, 30000);

  it("W3. career_plan: envelope→parse→ingest→accept→CareerPlan content 通过 aiCareerPlanV2Schema", async () => {
    const u = await seedUser();
    const text = wrap(baseArtifact("career_plan", {
      plan: {
        schemaVersion: 2, title: "测试计划",
        targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
        summary: "三年计划", horizon: { value: 3, unit: "year" },
        phases: [{
          id: "p1", title: "阶段一", objective: "入门",
          duration: { value: 6, unit: "month" }, skills: [],
          actions: [{
            id: "a1",
            title: "完成 5 道 SQL 聚合查询练习",
            description: "使用公开销售数据完成查询并记录过滤逻辑",
            type: "practice",
            status: "not_started",
            estimatedHours: 4,
            resources: [],
            outputs: ["5 道查询结果与说明"],
            acceptanceCriteria: ["能解释每个查询的分组和过滤条件"],
          }],
          outputs: ["5 道查询结果与说明"],
          evaluationCriteria: ["能解释每个查询的分组和过滤条件"],
          risks: [],
        }],
        immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
      },
    }, { baseVersion: null }));

    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(env.artifact).success).toBe(true);

    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s3",
      clientRequestId: `w3-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("career_plan");

    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    const plan = await (prisma as any).careerPlan.findFirst({
      where: { userId: u.id, status: "active" }, orderBy: { version: "desc" },
    });
    expect(plan).toBeDefined();
    expect(plan.schemaVersion).toBe(2);
    expect(aiCareerPlanV2Schema.safeParse(JSON.parse(plan.content)).success).toBe(true);
  }, 30000);

  it("W4. learning_route: envelope→parse→ingest→accept→LearningRoute 可查询, CareerPlan 不受影响", async () => {
    const u = await seedUser();

    // 先创建 active CareerPlan
    const plan = await (prisma as any).careerPlan.create({
      data: {
        userId: u.id, targetRole: "ai_product_manager", version: 3, status: "active",
        schemaVersion: 2, content: JSON.stringify({
          schemaVersion: 2, title: "原计划", targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
          summary: "原", horizon: { value: 3, unit: "year" },
          phases: [{ id: "p1", title: "一", objective: "", duration: { value: 1, unit: "month" }, skills: [],
            actions: [{ id: "a1", title: "t", description: "", type: "learning", status: "not_started", resources: [] }],
            outputs: [], evaluationCriteria: [], risks: [] }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        }),
        years: "[]", quarters: "[]", months: "[]", generationMeta: "{}",
      },
    });

    const text = wrap(baseArtifact("learning_route", {
      targetRole: "ai_product_manager", weeklyBudgetHours: 10, period: "12 周",
      stages: [{
        title: "基础阶段",
        description: "建立 SQL 查询基础",
        deliverables: ["查询练习记录"],
        tasks: [{
          title: "完成 SQL 基础课程练习",
          description: "完成公开课程中的聚合查询章节并记录操作步骤",
          estimatedHours: 4,
          outputs: ["查询练习记录"],
          acceptanceCriteria: ["能独立解释分组和过滤条件"],
        }],
      }],
      tasks: [], resources: [{ title: "资源1", type: "course" }],
      deliverables: ["作品集"], acceptanceCriteria: ["完成项目"], adjustmentTriggers: ["进度落后"],
      baseRouteVersion: null,
    }, { baseVersion: 3 }));

    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();
    expect(validatedAgentArtifactV1Schema.safeParse(env.artifact).success).toBe(true);

    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s4",
      clientRequestId: `w4-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("learning_route");

    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    // LearningRoute 可查询
    const lr = await (prisma as any).learningRoute.findFirst({
      where: { userId: u.id, status: "active" }, orderBy: { version: "desc" },
    });
    expect(lr).toBeDefined();
    expect(lr.version).toBe(1);
    expect(lr.relatedPlanId).toBe(plan.id);
    const lrContent = JSON.parse(lr.content);
    expect(lrContent.stages).toHaveLength(1);

    // CareerPlan 仍 active
    const activePlan = await (prisma as any).careerPlan.findFirst({
      where: { userId: u.id, status: "active" },
    });
    expect(activePlan).toBeDefined();
    expect(activePlan.id).toBe(plan.id);
  }, 30000);

  it("W5. simulation_report: envelope→parse→ingest→accept→AbilityEvidence 写入", async () => {
    const u = await seedUser();
    const text = wrap(baseArtifact("simulation_report", {
      abilityEvidence: [{
        abilityKey: "communication", summary: "模拟训练中协调能力优秀",
        sourceType: "simulation", sourceRef: "sim-1", confidence: 0.82,
      }],
    }));

    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();

    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s5",
      clientRequestId: `w5-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("ability_evidence");

    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    const ev = await prisma.abilityEvidence.findMany({
      where: { userId: u.id, status: "confirmed" },
    });
    expect(ev.length).toBe(1);
    expect(ev[0].abilityKey).toBe("communication");
    expect(ev[0].sourceType).toBe("simulation");
  }, 30000);

  it("W6. resume_review: envelope→parse→ingest→accept→AbilityEvidence 写入", async () => {
    const u = await seedUser();
    const text = wrap(baseArtifact("resume_review", {
      abilityEvidence: [{
        abilityKey: "projectPractice", summary: "作品集包含3个完整原型",
        sourceType: "resume", confidence: 0.92,
      }],
    }));

    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();

    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s6",
      clientRequestId: `w6-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("ability_evidence");

    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    const ev = await prisma.abilityEvidence.findMany({
      where: { userId: u.id, status: "confirmed", abilityKey: "projectPractice" },
    });
    expect(ev.length).toBe(1);
  }, 30000);

  it("W7. growth_review: envelope→parse→ingest→accept→CareerPlan(replan) with parentPlanId", async () => {
    const u = await seedUser();
    await (prisma as any).careerPlan.create({
      data: {
        userId: u.id, targetRole: "ai_product_manager", version: 1, status: "active",
        schemaVersion: 2, content: JSON.stringify({
          schemaVersion: 2, title: "原计划", targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
          summary: "原", horizon: { value: 2, unit: "year" },
          phases: [{
            id: "p1", title: "基础", objective: "起步", duration: { value: 6, unit: "month" }, skills: [],
            actions: [{
              id: "a1", title: "完成 2 次需求访谈练习",
              description: "针对真实校园场景完成访谈记录和需求归纳",
              type: "practice", status: "not_started", estimatedHours: 4, resources: [],
              outputs: ["2 份访谈记录"], acceptanceCriteria: ["每份记录包含明确问题与结论"],
            }],
            outputs: ["2 份访谈记录"], evaluationCriteria: ["每份记录包含明确问题与结论"], risks: [],
          }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        }),
        years: "[]", quarters: "[]", months: "[]", generationMeta: "{}",
      },
    });
    const text = wrap(baseArtifact("growth_review", {
      plan: {
        schemaVersion: 2, title: "调整后计划",
        targetRole: { key: "ai_product_manager", label: "AI 产品经理" },
        summary: "调整", horizon: { value: 2, unit: "year" },
        phases: [{
          id: "p2", title: "进阶", objective: "提升", duration: { value: 6, unit: "month" },
          skills: [],
          actions: [{
            id: "a1",
            title: "完成 2 次设计思维工作坊练习",
            description: "针对真实校园场景完成需求拆解和原型草图",
            type: "practice",
            status: "not_started",
            estimatedHours: 8,
            resources: [],
            outputs: ["2 份需求拆解与原型草图"],
            acceptanceCriteria: ["每份草图能对应一个明确用户问题"],
          }],
          outputs: ["2 份需求拆解与原型草图"],
          evaluationCriteria: ["每份草图能对应一个明确用户问题"],
          risks: [],
        }],
        immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
      },
      planPatch: { parentPlanId: "old-plan" },
    }, { baseVersion: 1 }));

    const env = parseAgentArtifactEnvelope(text);
    expect(env.artifact).toBeDefined();

    const svc = createAgentArtifactCandidateService({ db: prisma as never });
    const r = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s7",
      clientRequestId: `w7-${Date.now()}`, artifact: env.artifact,
    }, svc);
    expect(r.candidate?.candidateType).toBe("growth_replan");

    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    const plan = await (prisma as any).careerPlan.findFirst({
      where: { userId: u.id, status: "active" }, orderBy: { version: "desc" },
    });
    expect(plan).toBeDefined();
    expect(plan.parentPlanId).toBe("old-plan");
  }, 30000);
});

// ═══════════════════════════════════════════════════════════
// LearningRoute 版本管理
// ═══════════════════════════════════════════════════════════

describe("LearningRoute 版本管理", () => {
  it("LR1. 连续接受两条路线后版本分别为 1、2，只有版本 2 为 active", async () => {
    const u = await seedUser();
    await (prisma as any).careerPlan.create({
      data: {
        userId: u.id, targetRole: "ai_product_manager", version: 1, status: "active",
        schemaVersion: 2, content: JSON.stringify({
          schemaVersion: 2, title: "p", targetRole: { key: "ai_product_manager", label: "PM" },
          summary: "", horizon: { value: 1, unit: "year" },
          phases: [{ id: "p1", title: "", objective: "", duration: { value: 1, unit: "month" }, skills: [],
            actions: [{ id: "a1", title: "", description: "", type: "learning", status: "not_started", resources: [] }],
            outputs: [], evaluationCriteria: [], risks: [] }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        }),
        years: "[]", quarters: "[]", months: "[]", generationMeta: "{}",
      },
    });

    const svc = createAgentArtifactCandidateService({ db: prisma as never });

    // 第一条路线
    const a1 = baseArtifact("learning_route", {
      targetRole: "ai_product_manager", weeklyBudgetHours: 5, period: "4周",
      stages: [{
        title: "S1",
        description: "完成基础练习",
        deliverables: [],
        tasks: [{
          title: "完成基础练习任务",
          description: "按公开资料完成一次可复现的基础练习",
          estimatedHours: 4,
          outputs: ["练习记录"],
          acceptanceCriteria: ["记录包含步骤与结果"],
        }],
      }],
      tasks: [], resources: [], deliverables: [], acceptanceCriteria: [], adjustmentTriggers: [],
      baseRouteVersion: null,
    }, { baseVersion: 1 });
    const e1 = parseAgentArtifactEnvelope(wrap(a1));
    const r1 = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s", clientRequestId: `lr1-${Date.now()}`, artifact: e1.artifact,
    }, svc);
    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r1.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    // 查询第一条路线版本
    const lr1 = await (prisma as any).learningRoute.findFirst({
      where: { userId: u.id, status: "active" }, orderBy: { version: "desc" },
    });
    expect(lr1.version).toBe(1);
    const route1Version = lr1.version;

    // 第二条路线——带 baseRouteVersion
    const a2 = baseArtifact("learning_route", {
      targetRole: "ai_product_manager", weeklyBudgetHours: 10, period: "8周",
      stages: [{
        title: "S2",
        description: "完成进阶练习",
        deliverables: [],
        tasks: [{
          title: "完成进阶练习任务",
          description: "按公开资料完成一次可复现的进阶练习",
          estimatedHours: 6,
          outputs: ["进阶练习记录"],
          acceptanceCriteria: ["记录包含步骤、结果和复盘"],
        }],
      }],
      tasks: [], resources: [], deliverables: [], acceptanceCriteria: [], adjustmentTriggers: [],
      baseRouteVersion: route1Version,
    }, { baseVersion: 1 });
    const e2 = parseAgentArtifactEnvelope(wrap(a2));
    const r2 = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s", clientRequestId: `lr2-${Date.now()}`, artifact: e2.artifact,
    }, svc);
    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r2.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    // 验证版本递进
    const lr2 = await (prisma as any).learningRoute.findFirst({
      where: { userId: u.id, status: "active" }, orderBy: { version: "desc" },
    });
    expect(lr2.version).toBe(2);

    // 旧路线已归档
    const oldLr = await (prisma as any).learningRoute.findFirst({
      where: { userId: u.id, version: 1 },
    });
    expect(oldLr).toBeDefined();
    expect(oldLr.status).toBe("inactive");

    // 所有路线数量
    const all = await (prisma as any).learningRoute.findMany({ where: { userId: u.id } });
    expect(all.length).toBe(2);
  }, 30000);

  it("LR2. 陈旧 baseRouteVersion 候选必须冲突", async () => {
    const u = await seedUser();
    await (prisma as any).careerPlan.create({
      data: {
        userId: u.id, targetRole: "ai_product_manager", version: 2, status: "active",
        schemaVersion: 2, content: JSON.stringify({
          schemaVersion: 2, title: "p", targetRole: { key: "ai_product_manager", label: "PM" },
          summary: "", horizon: { value: 1, unit: "year" },
          phases: [{ id: "p1", title: "", objective: "", duration: { value: 1, unit: "month" }, skills: [],
            actions: [{ id: "a1", title: "", description: "", type: "learning", status: "not_started", resources: [] }],
            outputs: [], evaluationCriteria: [], risks: [] }],
          immediateActions: [], assumptions: [], riskNotes: [], evidenceRefs: [],
        }),
        years: "[]", quarters: "[]", months: "[]", generationMeta: "{}",
      },
    });

    const svc = createAgentArtifactCandidateService({ db: prisma as never });

    // 先接受第一条路线，version=1
    const a1 = baseArtifact("learning_route", {
      targetRole: "ai_product_manager", weeklyBudgetHours: 5,
      period: "4周",
      stages: [{
        title: "S1",
        description: "完成基础练习",
        deliverables: [],
        tasks: [{
          title: "完成基础练习任务",
          description: "按公开资料完成一次可复现的基础练习",
          estimatedHours: 4,
          outputs: ["练习记录"],
          acceptanceCriteria: ["记录包含步骤与结果"],
        }],
      }],
      tasks: [], resources: [], deliverables: [], acceptanceCriteria: [], adjustmentTriggers: [],
      baseRouteVersion: null,
    }, { baseVersion: 2 });
    const e1 = parseAgentArtifactEnvelope(wrap(a1));
    const r1 = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s", clientRequestId: `lrc1-${Date.now()}`, artifact: e1.artifact,
    }, svc);
    await resolveAgentArtifactCandidate({
      userId: u.id, candidateId: r1.candidate!.id, decision: "accept",
    }, { db: prisma as never });

    // 第二条路线——带旧的 baseRouteVersion=0（实际已是 version=1）
    const a2 = baseArtifact("learning_route", {
      targetRole: "ai_product_manager", weeklyBudgetHours: 10,
      period: "8周",
      stages: [{
        title: "S2",
        description: "完成进阶练习",
        deliverables: [],
        tasks: [{
          title: "完成进阶练习任务",
          description: "按公开资料完成一次可复现的进阶练习",
          estimatedHours: 6,
          outputs: ["进阶练习记录"],
          acceptanceCriteria: ["记录包含步骤、结果和复盘"],
        }],
      }],
      tasks: [], resources: [], deliverables: [], acceptanceCriteria: [], adjustmentTriggers: [],
      baseRouteVersion: 0, // 旧的版本号——当前已是 version=1
    }, { baseVersion: 2 });
    const e2 = parseAgentArtifactEnvelope(wrap(a2));
    const r2 = await ingestAgentArtifact({
      userId: u.id, conversationId: "", sessionId: "s", clientRequestId: `lrc2-${Date.now()}`, artifact: e2.artifact,
    }, svc);

    // 必须冲突——LearningRoute 版本已变
    await expect(
      resolveAgentArtifactCandidate({
        userId: u.id, candidateId: r2.candidate!.id, decision: "accept",
      }, { db: prisma as never }),
    ).rejects.toMatchObject({ code: "BASE_VERSION_CONFLICT", status: 409 });
  }, 30000);
});

// ═══════════════════════════════════════════════════════════
// 隐私导出与清空
// ═══════════════════════════════════════════════════════════

describe("隐私导出与清空", () => {
  it("PR1. 隐私导出包含 learningRoutes", async () => {
    const u = await seedUser();
    // 创建一条学习路线
    await (prisma as any).learningRoute.create({
      data: {
        userId: u.id, version: 1, status: "active", schemaVersion: 1,
        content: JSON.stringify({ targetRole: "ai_product_manager", stages: [{ title: "S1" }] }),
        basePlanVersion: 1,
      },
    });

    const user = await (prisma as any).user.findUnique({
      where: { id: u.id },
      select: {
        id: true, username: true, displayName: true, role: true, createdAt: true, updatedAt: true,
        profile: true, memories: true, plans: true, logs: true, simulations: true,
        updateCandidates: true, onboardingConversations: true,
        chatConversations: { include: { messages: true } },
        abilityEvidence: true, explorationReports: true, artifactCandidates: true,
        learningRoutes: { orderBy: { version: "desc" } },
      },
    });
    const { learningRoutes, ...rest } = user;
    const exportData = buildPrivacyExport({ ...rest, user: rest, learningRoutes, candidates: rest.updateCandidates, conversations: rest.chatConversations } as any);
    expect(exportData.learningRoutes).toBeDefined();
    expect(exportData.learningRoutes.length).toBe(1);
    expect((exportData.learningRoutes as any)[0].version).toBe(1);
  }, 30000);

  it("PR2. 清空后 LearningRoute 数量为 0", async () => {
    const u = await seedUser();
    await (prisma as any).learningRoute.create({
      data: {
        userId: u.id, version: 1, status: "active", schemaVersion: 1,
        content: JSON.stringify({ targetRole: "test" }),
      },
    });

    // 模拟清空流程
    await (prisma as any).$transaction(async (tx: any) => {
      await tx.agentArtifactCandidate.deleteMany({ where: { userId: u.id } });
      await tx.operationExecution.deleteMany({ where: { userId: u.id } });
      await tx.simulationSession.deleteMany({ where: { userId: u.id } });
      await tx.profileUpdateCandidate.deleteMany({ where: { userId: u.id } });
      await tx.abilityEvidence.deleteMany({ where: { userId: u.id } });
      await tx.learningRoute.deleteMany({ where: { userId: u.id } });
      await tx.careerPlan.deleteMany({ where: { userId: u.id } });
      await tx.careerExplorationReport.deleteMany({ where: { userId: u.id } });
      await tx.chatConversation.deleteMany({ where: { userId: u.id } });
      await tx.progressLog.deleteMany({ where: { userId: u.id } });
      await tx.memoryItem.deleteMany({ where: { userId: u.id } });
      await tx.onboardingConversation.deleteMany({ where: { userId: u.id } });
    });

    const routes = await (prisma as any).learningRoute.findMany({ where: { userId: u.id } });
    expect(routes.length).toBe(0);
  }, 30000);
});
