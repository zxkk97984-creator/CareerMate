/** 百宝箱主 Agent 能力注册表。
 *  这些名称仅用于解析和审计，开放 API 仍只传主应用 agent_id。 */
export const TBOX_CAPABILITIES = {
  profileAssessment: { label: "技能评估Agent", resultType: "profile_assessment" },
  roleMatch: { label: "画像匹配", resultType: "role_match" },
  careerPlan: { label: "职业规划Agent", resultType: "career_plan" },
  learningRoute: { label: "学习路线Agent", resultType: "learning_route" },
  simulationTurn: { label: "模拟面试Agent", resultType: "simulation_turn" },
  simulationReport: { label: "模拟面试Agent", resultType: "simulation_report" },
  resumeReview: { label: "简历优化Agent", resultType: "resume_review" },
} as const;

export type TboxCapability = keyof typeof TBOX_CAPABILITIES;
export type TboxResultType = (typeof TBOX_CAPABILITIES)[TboxCapability]["resultType"];
