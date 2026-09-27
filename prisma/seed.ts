import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildPlan, resources, roleTemplates, users } from "./seed-data";

const prisma = new PrismaClient();

const stringify = (value: unknown) => JSON.stringify(value);

// ── 数据库目标校验 ──────────────────────────────────────
function validateDatabaseTarget(): { valid: boolean; reason?: string } {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isE2E = process.env.CAREERMATE_E2E === "true";

  // E2E 模式必须指向 e2e.db（精确文件名匹配，避免 prod-e2e.db-backup 等误判）
  if (isE2E) {
    const extracted = extractDbFilename(dbUrl);
    if (!extracted) {
      return {
        valid: false,
        reason: `E2E 模式 (CAREERMATE_E2E=true) 无法解析 DATABASE_URL 中的数据库文件名: ${dbUrl}`,
      };
    }
    const normalized = extracted.toLowerCase();
    if (normalized !== "e2e.db" && normalized !== "e2e-test.db") {
      return {
        valid: false,
        reason: `E2E 模式 (CAREERMATE_E2E=true) 只能指向 e2e.db，当前数据库文件: ${extracted}`,
      };
    }
    return { valid: true };
  }

  // 非 E2E 的生产环境：永远禁止破坏性操作
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    return {
      valid: false,
      reason: "生产环境 (NODE_ENV=production) 禁止运行破坏性 seed。管理员初始化请使用非破坏性引导流程。",
    };
  }

  // 开发/测试环境：允许
  return { valid: true };
}

/** 从 DATABASE_URL 中提取数据库文件名（精确解析，不用 includes 模糊匹配） */
function extractDbFilename(dbUrl: string): string | null {
  // 去除协议前缀 file: 或 file:./
  const cleaned = dbUrl.replace(/^file:[.]?[\/\\]?/i, "");
  // 取最后一个路径段作为文件名
  const segments = cleaned.replace(/\\/g, "/").split("/");
  const filename = segments[segments.length - 1];
  if (!filename) return null;
  // 去除查询参数（如 ?connection_limit=1）
  const qIdx = filename.indexOf("?");
  return qIdx >= 0 ? filename.slice(0, qIdx) : filename;
}

async function main() {
  // ── 安全保护：数据库目标校验 + 生产环境禁止破坏性操作 ──
  const isProduction = process.env.NODE_ENV === "production";
  const isE2E = process.env.CAREERMATE_E2E === "true";

  // 数据库目标校验优先
  const targetCheck = validateDatabaseTarget();
  if (!targetCheck.valid) {
    console.error(`[seed] 数据库目标校验失败：${targetCheck.reason}`);
    console.error("[seed] 操作已拒绝，进程退出。");
    process.exit(1);
  }

  // 双重保险：生产环境永远禁止破坏性 seed
  if (isProduction && !isE2E) {
    console.error("[seed] 生产环境 (NODE_ENV=production) 禁止运行破坏性 seed。");
    console.error("[seed] 管理员凭据应从 CAREERMATE_ADMIN_USERNAME / CAREERMATE_ADMIN_PASSWORD_HASH 环境变量显式设置。");
    console.error("[seed] 请使用非破坏性引导流程或联系管理员。");
    process.exit(1);
  }

  if (isE2E) {
    console.log("[seed] E2E 模式：数据库目标已校验，开始创建测试数据。");
  } else {
    console.log("[seed] 开发环境：开始创建演示数据。");
  }

  // deleteMany 操作——仅在安全校验通过后执行
  await prisma.manualAiSample.deleteMany();
  await prisma.roleDraft.deleteMany();
  await prisma.simulationSession.deleteMany();
  await prisma.profileUpdateCandidate.deleteMany();
  await prisma.agentArtifactCandidate.deleteMany();
  await prisma.memoryItem.deleteMany();
  await prisma.progressLog.deleteMany();
  await prisma.careerPlan.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.resourceItem.deleteMany();
  await prisma.roleTemplate.deleteMany();

  const passwordHash = await bcrypt.hash("careermate123", 10);

  for (const item of users) {
    const created = await prisma.user.create({
      data: {
        username: item.username,
        displayName: item.displayName,
        role: item.role,
        passwordHash,
        profile: {
          create: {
            ...item.profile,
            onboardingCompleted: true,
            learningPreference: stringify(item.profile.learningPreference),
            interestTags: stringify(item.profile.interestTags),
            constraints: stringify(item.profile.constraints),
            abilityScores: stringify(item.profile.abilityScores),
          },
        },
      },
    });

    if (item.role === "user") {
      const plan = buildPlan(item.profile.targetRoleLabel);
      await prisma.careerPlan.create({
        data: {
          userId: created.id,
          targetRole: item.profile.targetRole,
          years: stringify(plan.years),
          quarters: stringify(plan.quarters),
          months: stringify(plan.months),
          assumptions: stringify(plan.assumptions),
          riskNotes: stringify(plan.riskNotes),
        },
      });

      await prisma.memoryItem.create({
        data: {
          userId: created.id,
          source: "seed",
          content: `${item.displayName} 当前目标是 ${item.profile.targetRoleLabel}，每周可投入 ${item.profile.weeklyAvailableHours} 小时。`,
        },
      });

      await prisma.progressLog.create({
        data: {
          userId: created.id,
          eventType: "seed_created",
          title: "创建演示成长档案",
          summary: "系统已导入初始画像、职业路径和长期记忆样例。",
        },
      });
    }
  }

  for (const role of roleTemplates) {
    await prisma.roleTemplate.create({
      data: {
        ...role,
        targetAudience: stringify(role.targetAudience),
        entryRequirements: stringify(role.entryRequirements),
        coreWork: stringify(role.coreWork),
        abilityWeights: stringify(role.abilityWeights),
        threeYearPath: stringify(role.threeYearPath),
        monthlyTemplates: stringify(role.monthlyTemplates),
        practiceProjects: stringify(role.practiceProjects),
        recommendedResources: stringify(role.recommendedResources),
        simulationScenarios: stringify(role.simulationScenarios),
        evaluationRules: stringify(role.evaluationRules),
        sources: stringify(role.sources),
      },
    });
  }

  for (const [title, type, roleKey, abilityKey, stage, source, description, estimatedHours] of resources) {
    await prisma.resourceItem.create({
      data: { title, type, roleKey, abilityKey, stage, source, description, estimatedHours },
    });
  }

  await prisma.roleDraft.create({
    data: {
      roleKey: "ai_project_assistant",
      roleName: "AI 项目助理",
      category: "项目/协作/AI 办公",
      content: stringify({
        reason: "用于演示 AI 辅助生成岗位草稿后由管理员审核入库。",
        abilityWeights: {
          aiTooling: 0.2,
          roleFoundation: 0.18,
          dataAnalysis: 0.1,
          businessProduct: 0.18,
          communication: 0.22,
          projectPractice: 0.12,
        },
      }),
    },
  });

  for (const [roleKey, roleName] of [
    ["ai_product_manager", "AI 产品经理"],
    ["data_analyst", "数据分析师"],
    ["aigc_operator", "AIGC 运营"],
  ]) {
    await prisma.manualAiSample.create({
      data: {
        scenario: `plan_generate_${roleKey}`,
        source: "百宝箱平台手工复制输出样例",
        payload: stringify(buildPlan(roleName)),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
