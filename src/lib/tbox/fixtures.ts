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
export function createMockStructuredResult(question: string): unknown | undefined {
  // 从增强 prompt 中提取用户原始消息
  const userQuestion = question.includes("用户原始问题：")
    ? question.split("用户原始问题：").pop()?.trim() ?? question
    : question;

  // 计划请求 -> AgentResponse.plan_draft operation
  if (/(?:制定|生成|调整|重做|规划|帮我).{0,10}(?:计划|路径|规划)|(?:三个月|3个月|90天|本周).{0,8}(?:计划|行动)/.test(userQuestion)) {
    return {
      schemaVersion: 1 as const,
      intent: "plan_generation" as const,
      task: { kind: "plan_generation" as const, status: "completed" as const, goal: "生成职业规划" },
      questions: [],
      operations: [{
        id: "op-plan-1",
        type: "plan_draft" as const,
        plan: {
          schemaVersion: 2 as const,
          targetRole: { key: "data_analyst", label: "数据分析师" },
          horizon: "中长期",
          phases: [
            { name: "基础夹实", goal: "掌握数据分析核心技能", durationWeeks: 12, keyActions: [{ id: "a1", title: "学习SQL与Python", done: false }] },
            { name: "项目实战", goal: "积累可展示的项目经验", durationWeeks: 12, keyActions: [{ id: "a2", title: "完成3个数据分析项目", done: false }] },
            { name: "求职冲刺", goal: "准备面试和简历", durationWeeks: 8, keyActions: [{ id: "a3", title: "准备面试作品集", done: false }] },
          ],
          assumptions: ["用户具备基础计算机操作能力"],
          riskNotes: ["学习进度可能受工作/学业影响"],
        },
      }],
      sourceRefs: [],
    };
  }

  // 每周时间 -> AgentResponse.profile_patch operation
  if (/每周.*?(\d+)\s*(个)?小时/.test(userQuestion)) {
    const match = userQuestion.match(/每周.*?(\d+)\s*(个)?小时/);
    const hours = match ? Number(match[1]) : 8;
    return {
      schemaVersion: 1 as const,
      intent: "career_advice" as const,
      task: { kind: "profile_guidance" as const, status: "collecting" as const, goal: "确认每周可用时间" },
      questions: [],
      operations: [{
        id: "op-patch-1",
        type: "profile_patch" as const,
        patch: { weeklyAvailableHours: hours },
        sourceKind: "explicit" as const,
        confidence: 0.99,
        evidenceExcerpt: userQuestion.slice(0, 200),
        reason: "用户在对话中明确说明了每周可投入时间。",
        sensitive: false,
      }],
      sourceRefs: [],
    };
  }

  // 职业调研 -> AgentResponse.exploration_report operation
  const roleMatch = userQuestion.match(/(?:介绍|了解|研究|想做|想成为|转行做)\s*([A-Za-z0-9一-龥·]{2,20}?)(?:这个)?(?:岗位|职业)/);
  if (roleMatch) {
    const roleName = roleMatch[1]!.trim();
    return {
      schemaVersion: 1 as const,
      intent: "career_research" as const,
      task: { kind: "career_research" as const, status: "completed" as const, goal: `了解${roleName}岗位` },
      questions: [],
      operations: [{
        id: "op-report-1",
        type: "exploration_report" as const,
        report: {
          roleName,
          summary: `当前处于本地辅助模式，先为${roleName}建立职业探索框架。`,
          responsibilities: ["该岗位具体职责需联网检索后补充"],
          coreCompetencies: ["通用能力：学习能力、沟通协作"],
          entryPaths: ["建议查询目标行业招聘要求"],
          marketSignals: ["当前离线结果未检索外部市场资料"],
          learningSuggestions: ["联网后核对典型岗位职责", "收集目标组织的真实招聘要求"],
          fitAnalysis: ["AI推断：现有信息不足"],
          risksAndUncertainties: ["未检索或核验外部资料"],
          sources: [{ title: "本地辅助模式", organization: "CareerMate", accessedAt: new Date().toISOString().slice(0, 10), label: "AI分析与推断" as const }],
        },
      }],
      sourceRefs: [],
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
