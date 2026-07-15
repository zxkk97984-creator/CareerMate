import { buildCareerPlan } from "@/lib/career";
import type { ProfileDto } from "@/lib/types";
import type { DatasetKey, RetrievalItem } from "./types";

const manualPlanRoles = new Set([
  "ai_product_manager",
  "data_analyst",
  "aigc_operator",
]);

/**
 * 生成 mock 模式的通用安全回答。
 * 注意：不能直接回显传入的 question——在 mock/manual 降级路径中，
 * question 可能是包含画像、计划、记忆和内部规则的增强 Prompt。
 * 这里只返回不含任何内部上下文的通用建议，避免泄露。
 */
export function createMockChatChunks(_question: string) {
  void _question; // 不直接回显——防止泄露增强 Prompt 中的内部上下文
  return [
    "你好！我是 **CareerMate**，你的 **AI 职业成长伙伴**。",
    "为了更好地帮助你，建议先确认**目标岗位**、**每周可投入时间**和**当前能力短板**——你可以在成长档案中查看和补充这些信息。",
    "下一步可以让我帮你**生成职业路径计划**，或者做一次**模拟训练**来校准当前能力画像。",
  ];
}

/**
 * 为 mock 模式生成通过 Schema 的结构化结果。
 * 根据用户问题中的关键词返回不同类型的能力 envelope。
 * 这是模型无关的确定性 fixture，确保 E2E 测试在 mock 模式下仍可验证卡片生成流程。
 */
/** 最小合法 career_plan fixture（通过 careerPlanSchema 校验） */
function createMockPlanResult() {
  return {
    type: "career_plan" as const,
    plan: {
      years: [
        { yearIndex: 1 as const, goal: "澄清目标岗位要求并建立基础学习节奏", expectedOutputs: ["完成目标岗位能力要求清单", "完成现有能力与差距自评"] },
        { yearIndex: 2 as const, goal: "围绕目标岗位积累可展示的实践成果", expectedOutputs: ["完成至少一个可展示的岗位相关成果"] },
        { yearIndex: 3 as const, goal: "通过真实协作与求职准备验证岗位适配度", expectedOutputs: ["完成岗位适配复盘与下一阶段计划"] },
      ],
      quarters: Array.from({ length: 12 }, (_, i) => ({
        quarterIndex: i + 1,
        goal: i < 4 ? "基础能力建立" : i < 8 ? "作品集强化" : "真实场景演练",
        milestone: `完成第${i + 1}季度的核心学习任务`,
        evaluation: `季度${i + 1}自评与导师反馈`,
      })),
      months: Array.from({ length: 36 }, (_, i) => ({
        monthIndex: i + 1,
        goal: i < 6 ? "打好基础" : i < 18 ? "完成进阶项目" : "职业冲刺",
        learningTasks: [
          { id: `task-${i}-1`, title: `学习核心技能 ${i + 1}`, type: "learn" as const, status: "not_started" as const },
          { id: `task-${i}-2`, title: `实践项目 ${i + 1}`, type: "practice" as const, status: "not_started" as const },
        ],
        practiceOutputs: [`月度输出 ${i + 1}`],
        evaluationMetrics: [`达标指标 ${i + 1}`],
      })),
      currentMonth: { monthIndex: 1, goal: "从今天开始行动", learningTasks: [{ id: "start-1", title: "确定本周学习目标", type: "learn" as const, status: "not_started" as const }], practiceOutputs: ["本周学习笔记"], evaluationMetrics: ["完成度评估"] },
      assumptions: ["执行前需确认每周可投入时长", "执行前需确认现有基础与工具条件"],
      riskNotes: ["学习进度可能受工作/学业周期性压力影响", "部分在线资源可能失效"],
    },
    candidateUpdates: [] as Array<{ field: string; newValue: unknown; confidence: number; reason: string; evidenceExcerpt: string; impactSummary: string; requiresConfirmation: true }>,
  };
}

export function createMockStructuredResult(question: string): unknown | undefined {
  // 从增强 prompt 中提取用户原始消息（避免画像上下文干扰关键词匹配）
  const userQuestion = question.includes("用户原始问题：")
    ? question.split("用户原始问题：").pop()?.trim() ?? question
    : question;

  // 计划请求优先匹配（比每周时间更精确的意图）
  if (/(?:制定|生成|调整|重做|规划).{0,10}(?:计划|路径)|(?:三个月|3个月|90天|本周).{0,8}(?:计划|行动)/.test(userQuestion)) {
    return createMockPlanResult();
  }

  // 每周时间 → profile_assessment + candidateUpdates
  if (/每周.*?(\d+)\s*(个)?小时/.test(userQuestion)) {
    const match = userQuestion.match(/每周.*?(\d+)\s*(个)?小时/);
    const hours = match ? Number(match[1]) : 8;
    return {
      type: "profile_assessment",
      targetRole: "data_analyst",
      scores: { aiTooling: 60, roleFoundation: 60, dataAnalysis: 70, businessProduct: 50, communication: 55, projectPractice: 45 },
      strengths: ["学习意愿明确", "时间规划清晰"],
      gaps: ["缺少产品思维训练", "协作经验不足"],
      evidence: [`用户说明每周可投入 ${hours} 小时学习`],
      assumptions: ["用户具备基础计算机操作能力"],
      needsConfirmation: true,
      candidateUpdates: [{
        field: "weeklyAvailableHours",
        newValue: hours,
        confidence: 0.99,
        reason: "用户在对话中明确说明了每周可投入时间。",
        evidenceExcerpt: userQuestion,
        impactSummary: "确认后，后续计划会按新的每周可投入时间调整任务强度。",
        requiresConfirmation: true,
      }],
    };
  }

  // 职业调研 → exploration_report（mock 固定数据，来源标注 AI分析与推断）
  const roleMatch = userQuestion.match(/(?:介绍|了解|研究|想做|想成为|转行做)\s*([A-Za-z0-9一-龥·]{2,20}?)(?:这个)?(?:岗位|职业)/);
  if (roleMatch) {
    const roleName = roleMatch[1]!.trim();
    return {
      type: "exploration_report" as const,
      roleName,
      summary: `当前处于本地辅助模式，先为“${roleName}”建立职业探索框架；市场事实需要在真实联网检索成功后补充。`,
      responsibilities: [],
      coreCompetencies: [],
      entryPaths: [],
      marketSignals: [],
      learningSuggestions: ["联网后核对典型岗位职责", "收集目标组织的真实招聘要求", "再根据已核验信息制定学习计划"],
      fitAnalysis: ["AI推断：现有信息不足，无法给出精准匹配结论。"],
      risksAndUncertainties: ["当前离线结果未检索或核验任何外部岗位与市场资料。"],
      sources: [{
        title: "本地辅助模式说明",
        organization: "CareerMate",
        accessedAt: new Date().toISOString().slice(0, 10),
        label: "AI分析与推断" as const,
      }],
    };
  }

  return undefined;
}

export function createManualChatAnswer(question: string) {
  return createMockChatChunks(question).join("\n");
}

export function getManualCareerPlanFixture(profile: ProfileDto) {
  if (!profile.targetRole) return null;
  return manualPlanRoles.has(profile.targetRole) ? buildCareerPlan(profile as any) : null;
}

export function getMockCareerPlanFixture(profile: ProfileDto) {
  return buildCareerPlan(profile);
}

const retrievalFixtures: Record<DatasetKey, RetrievalItem[]> = {
  roleCompetency: [
    { content: "岗位能力模板：专业基础、数据分析、业务理解、沟通协作与项目实践。", source: "local-role-template", score: 1 },
  ],
  learningResources: [
    { content: "本地学习资源：使用小项目、复盘记录和可展示作品验证学习结果。", source: "local-resource-item", score: 1 },
  ],
  simulationScenes: [
    { content: "本地模拟场景：跨角色沟通、需求澄清和 AI 办公任务。", source: "local-role-template", score: 1 },
  ],
  ethicsRules: [
    {
      content: "保护个人隐私并取得知情同意；AI 建议仅供参考且须保留人工确认；禁止未经授权抓取数据。",
      source: "local-ethics-rule",
      score: 1,
    },
  ],
  careerTrends: [{
    content: "本地职业趋势资料只能作为静态背景，不能宣称为实时招聘市场。",
    source: "local-career-trends",
    score: 1,
  }],
};

export function getMockRetrievalItems(datasetKey: DatasetKey, limit: number) {
  return retrievalFixtures[datasetKey].slice(0, limit);
}
