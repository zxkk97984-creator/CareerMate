import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const stringify = (value: unknown) => JSON.stringify(value);

const abilityDefaults = {
  aiTooling: 58,
  roleFoundation: 42,
  dataAnalysis: 45,
  businessProduct: 50,
  communication: 62,
  projectPractice: 38,
};

const users = [
  {
    username: "student_lin",
    displayName: "小林",
    role: "user",
    profile: {
      educationStage: "junior",
      major: "数字媒体技术",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
      weeklyAvailableHours: 6,
      learningPreference: ["project", "practice"],
      experienceSummary: "会基础办公和内容制作，对 AI 产品方向感兴趣，缺少完整项目经历。",
      interestTags: ["AI 工具", "产品设计", "校园项目"],
      constraints: ["项目经验不足", "数据分析基础一般"],
      abilityScores: abilityDefaults,
    },
  },
  {
    username: "student_chen",
    displayName: "小周",
    role: "user",
    profile: {
      educationStage: "sophomore",
      major: "统计学",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 8,
      learningPreference: ["text", "project"],
      experienceSummary: "数学和统计基础较好，想准备数据方向实习。",
      interestTags: ["SQL", "可视化", "业务分析"],
      constraints: ["业务理解不足"],
      abilityScores: {
        aiTooling: 52,
        roleFoundation: 60,
        dataAnalysis: 68,
        businessProduct: 45,
        communication: 50,
        projectPractice: 42,
      },
    },
  },
  {
    username: "student_wu",
    displayName: "小陈",
    role: "user",
    profile: {
      educationStage: "junior",
      major: "新闻传播",
      targetRole: "aigc_operator",
      targetRoleLabel: "AIGC 内容运营",
      weeklyAvailableHours: 5,
      learningPreference: ["video", "practice"],
      experienceSummary: "有内容创作经验，常用 AIGC 工具，希望沉淀作品集。",
      interestTags: ["内容策划", "AIGC", "新媒体"],
      constraints: ["数据复盘不系统"],
      abilityScores: {
        aiTooling: 66,
        roleFoundation: 58,
        dataAnalysis: 38,
        businessProduct: 52,
        communication: 64,
        projectPractice: 54,
      },
    },
  },
  {
    username: "worker_zhao",
    displayName: "阿敏",
    role: "user",
    profile: {
      educationStage: "worker",
      major: "市场营销",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
      weeklyAvailableHours: 3,
      learningPreference: ["practice", "mentor"],
      experienceSummary: "运营岗位 1 年，想转 AI 产品，但可投入时间有限。",
      interestTags: ["用户增长", "需求分析", "AI 办公"],
      constraints: ["每周学习时间少", "技术理解薄弱"],
      abilityScores: {
        aiTooling: 55,
        roleFoundation: 35,
        dataAnalysis: 42,
        businessProduct: 60,
        communication: 70,
        projectPractice: 46,
      },
    },
  },
  {
    username: "career_switch_li",
    displayName: "宇航",
    role: "user",
    profile: {
      educationStage: "career_switcher",
      major: "新媒体运营",
      targetRole: "data_analyst",
      targetRoleLabel: "数据分析师",
      weeklyAvailableHours: 7,
      learningPreference: ["text", "project", "practice"],
      experienceSummary: "做过新媒体，想转数据分析，也在考虑 AIGC 内容运营。",
      interestTags: ["转岗", "数据看板", "内容分析"],
      constraints: ["目标方向摇摆"],
      abilityScores: {
        aiTooling: 60,
        roleFoundation: 40,
        dataAnalysis: 44,
        businessProduct: 55,
        communication: 62,
        projectPractice: 48,
      },
    },
  },
  {
    username: "admin",
    displayName: "管理员",
    role: "admin",
    profile: {
      educationStage: "worker",
      major: "项目管理",
      targetRole: "ai_product_manager",
      targetRoleLabel: "AI 产品经理",
      weeklyAvailableHours: 10,
      learningPreference: ["text"],
      experienceSummary: "负责 CareerMate 演示数据与岗位草稿审核。",
      interestTags: ["知识库", "审核", "项目管理"],
      constraints: [],
      abilityScores: {
        aiTooling: 70,
        roleFoundation: 72,
        dataAnalysis: 60,
        businessProduct: 78,
        communication: 76,
        projectPractice: 72,
      },
    },
  },
];

const roleTemplates = [
  {
    roleKey: "ai_product_manager",
    roleName: "AI 产品经理",
    category: "产品/业务/AI 应用",
    targetAudience: ["数字媒体", "经管", "运营", "计算机交叉背景学生"],
    entryRequirements: ["理解产品需求文档", "会使用主流 AI 工具", "能完成基础竞品分析"],
    coreWork: ["用户需求分析", "AI 功能设计", "Prompt 与工作流验证", "跨团队沟通"],
    abilityWeights: {
      aiTooling: 0.2,
      roleFoundation: 0.2,
      dataAnalysis: 0.12,
      businessProduct: 0.24,
      communication: 0.16,
      projectPractice: 0.08,
    },
    threeYearPath: ["入门产品表达与 AI 工具", "完成 AI 应用项目", "形成行业方案能力"],
    monthlyTemplates: ["PRD 拆解", "竞品分析", "低保真原型", "用户访谈复盘"],
    practiceProjects: ["校园 AI 助手原型", "AI 工具竞品分析报告"],
    recommendedResources: ["公开产品课程目录", "AI 产品案例文章", "roadmap.sh 学习组织方式参考"],
    simulationScenarios: ["跨岗位沟通", "AI 辅助办公"],
    evaluationRules: ["是否能说清用户问题", "是否能拆成可执行需求", "是否能解释 AI 能力边界"],
    sources: ["人工整理公开信息", "赛题需求", "项目组讨论"],
  },
  {
    roleKey: "data_analyst",
    roleName: "数据分析师",
    category: "数据/分析/决策",
    targetAudience: ["统计", "数学", "经管", "运营转岗用户"],
    entryRequirements: ["基础统计", "SQL 入门", "Excel 或 BI 工具"],
    coreWork: ["指标体系", "数据清洗", "可视化看板", "业务洞察"],
    abilityWeights: {
      aiTooling: 0.12,
      roleFoundation: 0.18,
      dataAnalysis: 0.32,
      businessProduct: 0.16,
      communication: 0.1,
      projectPractice: 0.12,
    },
    threeYearPath: ["补齐 SQL 与统计", "完成业务分析项目", "承担指标体系和专题分析"],
    monthlyTemplates: ["SQL 练习", "指标拆解", "看板复盘", "业务问题分析"],
    practiceProjects: ["校园活动数据看板", "电商转化漏斗分析"],
    recommendedResources: ["SQL 公开教程", "统计学入门教材目录", "BI 工具官方文档"],
    simulationScenarios: ["远程协作", "AI 辅助办公"],
    evaluationRules: ["是否能定义指标", "是否能解释分析结论", "是否能提出业务动作"],
    sources: ["人工整理公开信息", "脱敏岗位样例"],
  },
  {
    roleKey: "aigc_operator",
    roleName: "AIGC 内容运营",
    category: "内容/运营/增长",
    targetAudience: ["新闻传播", "新媒体", "设计", "运营方向学生"],
    entryRequirements: ["内容策划基础", "AI 文图工具使用", "平台运营意识"],
    coreWork: ["选题策划", "AIGC 内容生产", "账号运营", "数据复盘"],
    abilityWeights: {
      aiTooling: 0.24,
      roleFoundation: 0.18,
      dataAnalysis: 0.12,
      businessProduct: 0.16,
      communication: 0.12,
      projectPractice: 0.18,
    },
    threeYearPath: ["掌握 AIGC 工作流", "形成内容作品集", "能做增长复盘与栏目策划"],
    monthlyTemplates: ["Prompt 模板库", "内容日历", "作品集页面", "数据复盘"],
    practiceProjects: ["AIGC 校园栏目", "品牌内容改写实验"],
    recommendedResources: ["AIGC 工具官方文档", "内容运营公开课程目录"],
    simulationScenarios: ["AI 辅助办公", "远程协作"],
    evaluationRules: ["是否有明确受众", "是否能复盘数据", "是否能沉淀作品"],
    sources: ["人工整理公开信息", "项目组讨论"],
  },
];

const resources = [
  ["PRD 写作入门", "course", "ai_product_manager", "roleFoundation", "beginner", "人工整理公开资源", "学习需求背景、用户故事、验收标准的基础写法。", 3],
  ["AI 工具竞品分析模板", "practice", "ai_product_manager", "businessProduct", "beginner", "自建实践项目", "选择 2 个 AI 工具，比较目标用户、核心流程和差异点。", 4],
  ["SQL 查询基础", "course", "data_analyst", "dataAnalysis", "beginner", "人工整理公开资源", "覆盖 select、join、group by、窗口函数入门。", 8],
  ["校园活动数据看板", "project", "data_analyst", "projectPractice", "portfolio", "自建脱敏模拟数据", "使用模拟活动数据完成指标拆解和可视化。", 10],
  ["AIGC 内容选题日历", "template", "aigc_operator", "roleFoundation", "beginner", "自建模板", "按目标受众、内容形式、发布频率组织选题。", 2],
  ["Prompt 作品集复盘", "practice", "aigc_operator", "aiTooling", "portfolio", "自建实践项目", "沉淀 5 个内容生产 Prompt 与前后对比。", 5],
] as const;

function buildPlan(roleName: string) {
  return {
    years: [
      { yearIndex: 1, goal: `建立 ${roleName} 入门能力`, expectedOutputs: ["完成 2 个基础项目", "形成学习笔记"] },
      { yearIndex: 2, goal: `形成 ${roleName} 作品集`, expectedOutputs: ["完成 1 个综合项目", "完成模拟面试"] },
      { yearIndex: 3, goal: `具备独立承担 ${roleName} 任务能力`, expectedOutputs: ["沉淀作品集", "准备实习/求职材料"] },
    ],
    quarters: Array.from({ length: 12 }, (_, index) => ({
      quarterIndex: index + 1,
      goal: `第 ${index + 1} 季度里程碑`,
      milestone: index < 4 ? "补基础并完成小项目" : index < 8 ? "强化作品集" : "面向实习/求职准备",
      evaluation: "至少完成 1 个可展示产出并复盘。",
    })),
    months: Array.from({ length: 36 }, (_, index) => ({
      monthIndex: index + 1,
      goal: `第 ${index + 1} 个月行动目标`,
      learningTasks: [
        { id: `task_m${index + 1}_1`, title: "完成本月核心学习材料", type: "learn", status: index === 0 ? "in_progress" : "not_started", dueWeek: 2 },
        { id: `task_m${index + 1}_2`, title: "输出一个实践产出", type: "practice", status: "not_started", dueWeek: 4 },
      ],
      practiceOutputs: ["学习笔记", "实践作品或分析报告"],
      evaluationMetrics: ["是否按时完成", "是否能用 3 分钟讲清产出价值"],
    })),
    assumptions: ["计划基于当前画像和每周可投入时间生成", "真实资源会随着知识库完善而更新"],
    riskNotes: ["若每周投入时间变化，需要触发重规划", "AI 建议仅供参考"],
  };
}

async function main() {
  await prisma.manualAiSample.deleteMany();
  await prisma.roleDraft.deleteMany();
  await prisma.simulationSession.deleteMany();
  await prisma.profileUpdateCandidate.deleteMany();
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

  await prisma.manualAiSample.create({
    data: {
      scenario: "plan_generate_ai_product_manager",
      source: "百宝箱平台手工复制输出样例",
      payload: stringify(buildPlan("AI 产品经理")),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
