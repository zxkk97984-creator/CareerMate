import { getTboxConfig } from "@/lib/env";
import { buildCareerPlan } from "@/lib/career";
import { getPrisma } from "@/lib/prisma";
import { parseJson } from "@/lib/json";
import type { ProfileDto } from "@/lib/types";

export async function generatePlanWithTbox(profile: ProfileDto) {
  const config = getTboxConfig();

  if (config.mode === "manual") {
    const sample = await getPrisma().manualAiSample.findFirst({
      where: { scenario: `plan_generate_${profile.targetRole}` },
    });
    if (sample) {
      return {
        mode: "manual",
        payload: parseJson(sample.payload, buildCareerPlan(profile)),
        note: "当前为 manual 模式：结果来自手工导入的百宝箱输出样例。",
      };
    }
  }

  if (config.mode === "api") {
    if (!config.apiKey || !config.agentId) {
      return {
        mode: "api",
        payload: buildCareerPlan(profile),
        note: "百宝箱 API-Key 或 agent_id 未配置，已使用本地结构化结果占位。",
        permissionPending: true,
      };
    }

    return {
      mode: "api",
      payload: buildCareerPlan(profile),
      note: "API 模式已启用；当前 P0 版本保留结构化校验与降级结果，真实调用可在白名单开通后替换。",
    };
  }

  return {
    mode: "mock",
    payload: buildCareerPlan(profile),
    note: "当前为 mock 模式：使用本地开发测试数据。",
  };
}

export function createMockChatChunks(question: string) {
  const trimmed = question.trim() || "我想做职业规划";
  return [
    `我先理解一下：你提到「${trimmed}」。`,
    "建议先确认目标岗位、每周可投入时间和当前能力短板。",
    "下一步可以生成 3 年路径，或者先做一次职场模拟训练来校准画像。",
  ];
}
