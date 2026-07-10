import { buildCareerPlan } from "@/lib/career";
import type { ProfileDto } from "@/lib/types";
import type { DatasetKey, RetrievalItem } from "./types";

const manualPlanRoles = new Set([
  "ai_product_manager",
  "data_analyst",
  "aigc_operator",
]);

export function createMockChatChunks(question: string) {
  const trimmed = question.trim() || "我想做职业规划";
  return [
    `我先理解一下：你提到「${trimmed}」。`,
    "建议先确认目标岗位、每周可投入时间和当前能力短板。",
    "下一步可以生成 3 年路径，或者先做一次职场模拟训练来校准画像。",
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
