import { z } from "zod";

const abilityWeightsSchema = z.object({
  aiTooling: z.number().min(0).max(1), roleFoundation: z.number().min(0).max(1),
  dataAnalysis: z.number().min(0).max(1), businessProduct: z.number().min(0).max(1),
  communication: z.number().min(0).max(1), projectPractice: z.number().min(0).max(1),
}).strict();

export const roleDraftContentSchema = z.object({
  reason: z.string().trim().min(5),
  targetAudience: z.array(z.string().trim().min(1)).min(1),
  entryRequirements: z.array(z.string().trim().min(1)).min(1),
  coreWork: z.array(z.string().trim().min(1)).min(1),
  abilityWeights: abilityWeightsSchema,
  sources: z.array(z.string().trim().min(2)).min(1),
}).strict();

export type RoleDraftContent = z.infer<typeof roleDraftContentSchema>;

export function roleKeyFromName(roleName: string) {
  const ascii = roleName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `custom_${ascii || "ai"}`;
}

export function buildRoleDraftContent(roleName: string, sources: string[]): RoleDraftContent {
  return {
    reason: `围绕 ${roleName} 生成的结构化岗位草稿，须经管理员核验后入库。`,
    targetAudience: ["高校生", "职场新人"],
    entryRequirements: ["具备基础办公与信息检索能力", "能够安全使用 AI 工具辅助工作"],
    coreWork: ["拆解岗位任务与目标", "使用 AI 工具辅助产出", "核验结果并完成复盘汇报"],
    abilityWeights: { aiTooling: 0.2, roleFoundation: 0.18, dataAnalysis: 0.16, businessProduct: 0.16, communication: 0.18, projectPractice: 0.12 },
    sources,
  };
}

export function roleDraftValidation(content: unknown) {
  const parsed = roleDraftContentSchema.safeParse(content);
  return parsed.success ? { valid: true as const, issues: [] } : { valid: false as const, issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}
