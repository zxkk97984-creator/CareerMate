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
    "你好！我是 CareerMate，你的 AI 职业成长伙伴。",
    "为了更好地帮助你，建议先确认目标岗位、每周可投入时间和当前能力短板——你可以在成长档案中查看和补充这些信息。",
    "下一步可以让我帮你生成职业路径计划，或者做一次模拟训练来校准当前能力画像。",
  ];
}

export function createManualChatAnswer(question: string) {
  return createMockChatChunks(question).join("\n");
}

export function getManualCareerPlanFixture(profile: ProfileDto) {
  return manualPlanRoles.has(profile.targetRole) ? buildCareerPlan(profile) : null;
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
};

export function getMockRetrievalItems(datasetKey: DatasetKey, limit: number) {
  return retrievalFixtures[datasetKey].slice(0, limit);
}
