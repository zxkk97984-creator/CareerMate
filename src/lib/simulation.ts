import { z } from "zod";
import { parseJson } from "@/lib/json";
import type { AiExecutionMeta } from "@/lib/types";

export const simulationScenarioKeys = [
  "cross_role_communication",
  "ai_office",
  "remote_collaboration",
  "data_driven_decision",
  "requirement_clarification",
  "career_interview",
] as const;
export type SimulationScenarioKey = (typeof simulationScenarioKeys)[number];
export const simulationScenarioSchema = z.enum(simulationScenarioKeys);

export type SimulationDifficulty = "L1" | "L2" | "L3";

export interface SimulationScenarioMeta {
  key: SimulationScenarioKey;
  title: string;
  difficulty: SimulationDifficulty;
  durationMinutes: number;
  skills: string[];
  role: string;
  counterpart: string;
  objective: string;
  brief: string;
  openingMessage: string;
  prompts: string[];
  scoringDimensions: string[];
}

const scenarios: Record<SimulationScenarioKey, Omit<SimulationScenarioMeta, "key">> = {
  cross_role_communication: {
    title: "跨岗位沟通",
    difficulty: "L1",
    durationMinutes: 6,
    skills: ["communication", "businessProduct"],
    role: "产品同学",
    counterpart: "技术负责人",
    objective: "向技术负责人说明 AI 简历分析功能要解决的核心用户问题、业务价值与验收标准。",
    brief: "你负责 AI 简历分析功能，技术负责人质疑现有范围、数据口径和交付节奏，请主动说明用户价值与优先级，在沟通中对齐目标、边界和验收标准，避免后续返工。",
    openingMessage: "你是产品同学，我是技术负责人。请先说明 AI 简历分析功能要解决的核心用户问题、目标用户和最终业务目标。",
    prompts: [
      "请补充优先级、验收标准与回退方案。",
      "文件解析失败时你会如何处理并降级？",
      "你会如何向非技术同学解释能力边界？",
      "请明确依赖、负责人和下一步。",
      "最后用三句话总结方案。",
    ],
    scoringDimensions: ["需求表达", "优先级判断", "风险意识", "验收标准"],
  },
  ai_office: {
    title: "AI 办公",
    difficulty: "L1",
    durationMinutes: 5,
    skills: ["aiTooling", "projectPractice"],
    role: "产品专员",
    counterpart: "团队主管",
    objective: "说明你准备如何使用 AI 工具把产品例会整理成行动项，并给出可量化的效率提升指标。",
    brief: "你刚接手产品例会纪要工作，希望用 AI 工具提升效率，但需要先想清楚输入、校验、隐私和复用方式，再向主管提出可落地的流程方案，并说明风险和改进点。",
    openingMessage: "请把一次产品例会整理成具体行动项，并说明你准备如何使用 AI 工具提升效率。",
    prompts: [
      "你会怎样核验 AI 生成内容的准确性？",
      "哪些信息不应该提交给外部 AI 工具？",
      "请给出可量化的效率指标。",
      "如何让团队复用这套流程？",
      "最后总结风险和改进点。",
    ],
    scoringDimensions: ["纪要质量", "AI 使用规范", "数据隐私", "量化指标"],
  },
  remote_collaboration: {
    title: "远程协作",
    difficulty: "L2",
    durationMinutes: 7,
    skills: ["communication", "projectPractice"],
    role: "项目协调人",
    counterpart: "远程团队同事",
    objective: "项目出现延期风险，请先写一段异步进度同步，明确现状、影响、依赖和下一步。",
    brief: "项目出现延期风险，你需要在没有实时会议的情况下推进：先异步同步现状，再明确依赖、决策记录和升级路径，避免信息遗漏，最后给出可执行的收尾清单。",
    openingMessage: "项目出现延期风险，请先写一段异步进度同步，说明现状、影响、依赖和下一步。",
    prompts: [
      "请明确依赖方和截止时间。",
      "如果关键成员没有回复，你会怎样升级风险？",
      "如何记录决策并避免信息遗漏？",
      "请补充一个备选方案。",
      "最后给出可执行的收尾清单。",
    ],
    scoringDimensions: ["同步效率", "风险升级", "决策记录", "收尾执行"],
  },
  data_driven_decision: {
    title: "数据驱动决策",
    difficulty: "L2",
    durationMinutes: 7,
    skills: ["dataAnalysis", "businessProduct"],
    role: "数据分析师/产品运营",
    counterpart: "业务负责人",
    objective: "业务方反馈首单转化率连续两周下滑，请用数据定位原因并提出可验证的优化假设。",
    brief: "业务方反馈注册到首单的转化率连续两周下滑，但只给了结论没给口径。你需要先确认统计口径和周期，再拆解漏斗定位下滑环节，最后提出可验证假设并设计 A/B 验证。",
    openingMessage: "业务方反馈：注册到首单的转化率连续两周下滑，请先说明你会如何确认口径并定位原因。",
    prompts: [
      "如何确认转化率的统计口径？",
      "如果各个漏斗环节同时下降，你会如何排查原因？",
      "如何设计实验验证这个假设?",
      "如果实验不支持假设怎么办？",
      "请给出下一步的数据监控方案。",
    ],
    scoringDimensions: ["数据口径", "漏斗分析", "假设验证", "结论表达"],
  },
  requirement_clarification: {
    title: "需求澄清会",
    difficulty: "L2",
    durationMinutes: 6,
    skills: ["businessProduct", "communication"],
    role: "产品经理",
    counterpart: "业务负责人",
    objective: "业务方只给了一句模糊需求，请通过澄清明确目标、边界和优先级，再输出需求方案。",
    brief: "业务方发来一句“把报表做得更好看”就要求排期。你需要先判断这背后的真实目标与用户场景，通过提问澄清范围、优先级和验收标准，再给出可执行需求方案。",
    openingMessage: "业务方说：“把报表做得更好看，下个月要上线。”请先提出至少 3 个关键问题澄清真实需求，再说明你会如何推进。",
    prompts: [
      "你会先确认哪些关键信息？",
      "怎样把模糊诉求转成需求？",
      "如何确定本次需求的优先级？",
      "如何约定验收标准和排期？",
      "最后给出需求文档的结构框架。",
    ],
    scoringDimensions: ["提问质量", "需求提炼", "优先级", "交付约定"],
  },
  career_interview: {
    title: "岗位面试",
    difficulty: "L2",
    durationMinutes: 8,
    skills: ["roleFoundation", "communication", "businessProduct"],
    role: "候选人",
    counterpart: "面试官",
    objective: "围绕目标岗位的核心职责、项目经历和专业能力进行结构化面试。",
    brief: "你正在参加目标岗位面试，面试官会围绕核心能力、项目经验和情景问题逐步追问。",
    openingMessage: "你好，欢迎参加本次岗位面试。请先做一个简短的自我介绍，并说明你为什么适合这个岗位。",
    prompts: [
      "请结合一段项目或课程经历，说明你如何运用核心能力解决问题。",
      "如果入职后遇到跨角色协作冲突，你会如何处理？",
      "你认为这个岗位当前最大的挑战是什么？",
      "请分享一次失败或复盘经历。",
      "最后请用三句话总结你的岗位匹配点。",
    ],
    scoringDimensions: ["岗位匹配", "专业能力", "表达结构", "临场应变"],
  },
};

export function listSimulationScenarios(): SimulationScenarioMeta[] {
  return simulationScenarioKeys
    .filter((key) => key !== "career_interview")
    .map((key) => ({ key, ...scenarios[key] }));
}

/** 根据用户目标岗位生成岗位面试场景 */
export function buildCareerInterviewScenario(profile: {
  targetRole?: string | null;
  targetRoleLabel?: string | null;
}): SimulationScenarioMeta {
  const roleName = profile.targetRoleLabel ?? profile.targetRole ?? "目标岗位";
  const roleKey = profile.targetRole ?? "target_role";
  return {
    key: "career_interview",
    title: `${roleName} 岗位面试`,
    difficulty: "L2",
    durationMinutes: 8,
    skills: ["roleFoundation", "communication", "businessProduct"],
    role: roleName,
    counterpart: "面试官",
    objective: `围绕 ${roleName} 的核心职责、项目经历和专业能力进行结构化面试，并在追问中展示你的思考过程。`,
    brief: `你正在面试 ${roleName} 岗位。面试官会围绕岗位核心能力、项目经验和情景问题逐步追问，请用 STAR 方式组织回答。`,
    openingMessage: `你好，欢迎参加 ${roleName} 岗位面试。请先做一个简短的自我介绍，并说明你为什么适合这个岗位。`,
    prompts: [
      "请结合一段项目或课程经历，说明你如何运用核心能力解决实际问题。",
      `如果入职后第一个月就遇到 ${roleName} 岗位常见的协作冲突，你会如何处理？`,
      "你认为这个岗位当前最大的挑战是什么？你准备如何补上差距？",
      "请分享一次失败或复盘经历，并说明你从中获得了什么。",
      "最后请用三句话总结你与这个岗位的匹配点。",
    ],
    scoringDimensions: ["岗位匹配", "专业能力", "表达结构", "临场应变"],
  };
}

export interface RoleSimulationSource {
  roleName: string;
  coreWork: string[];
  practiceProjects: string[];
  simulationScenarios: string[];
}

function scenarioKeyForTitle(title: string): SimulationScenarioKey {
  if (title === "跨岗位沟通") return "cross_role_communication";
  if (title === "AI 辅助办公") return "ai_office";
  if (title === "远程协作") return "remote_collaboration";
  return "cross_role_communication";
}

const roleScenarioMap: Record<string, Omit<SimulationScenarioMeta, "key">> = {
  "跨岗位沟通": {
    title: "跨岗位沟通",
    difficulty: "L1",
    durationMinutes: 6,
    skills: ["communication", "businessProduct"],
    role: "岗位候选人",
    counterpart: "协作方负责人",
    objective: "围绕目标岗位的核心工作，与协作方对齐目标、边界和验收标准。",
    brief: "你正在推进目标岗位的典型工作，协作方对范围、口径和节奏提出质疑。",
    openingMessage: "协作方质疑当前方案的范围和节奏。请先说明核心问题、目标用户和最终业务目标。",
    prompts: [
      "请补充优先级、验收标准与回退方案。",
      "如果协作方仍不认可，你会如何调整沟通方式？",
      "如何向非专业协作者解释能力边界？",
      "请明确依赖、负责人和下一步。",
      "最后用三句话总结方案。",
    ],
    scoringDimensions: ["需求表达", "优先级判断", "风险意识", "验收标准"],
  },
  "AI 辅助办公": {
    title: "AI 辅助办公",
    difficulty: "L1",
    durationMinutes: 5,
    skills: ["aiTooling", "projectPractice"],
    role: "岗位候选人",
    counterpart: "团队主管",
    objective: "说明如何用 AI 工具完成岗位日常任务，并给出可量化的效率指标。",
    brief: "你刚接手岗位日常任务，希望用 AI 工具提升效率，需要说明输入、校验、隐私和复用方式。",
    openingMessage: "请说明你准备如何用 AI 工具完成岗位日常任务，并给出可量化的效率指标。",
    prompts: [
      "你会怎样核验 AI 生成内容的准确性？",
      "哪些信息不应该提交给外部 AI 工具？",
      "请给出可量化的效率指标。",
      "如何让团队复用这套流程？",
      "最后总结风险和改进点。",
    ],
    scoringDimensions: ["任务完成度", "AI 使用规范", "数据隐私", "量化指标"],
  },
  "远程协作": {
    title: "远程协作",
    difficulty: "L2",
    durationMinutes: 7,
    skills: ["communication", "projectPractice"],
    role: "岗位候选人",
    counterpart: "远程团队同事",
    objective: "在异步环境下推进目标岗位的典型任务，并给出清晰的同步和升级方案。",
    brief: "目标岗位的跨地域项目出现延期风险，你需要异步同步现状、依赖和下一步。",
    openingMessage: "项目出现延期风险，请先写一段异步进度同步，说明现状、影响、依赖和下一步。",
    prompts: [
      "请明确依赖方和截止时间。",
      "如果关键成员没有回复，你会怎样升级风险？",
      "如何记录决策并避免信息遗漏？",
      "请补充一个备选方案。",
      "最后给出可执行的收尾清单。",
    ],
    scoringDimensions: ["同步效率", "风险升级", "决策记录", "收尾执行"],
  },
};

export function buildRoleSimulationScenarios(
  profile: { targetRole?: string | null; targetRoleLabel?: string | null },
  source: RoleSimulationSource,
): SimulationScenarioMeta[] {
  const roleName = profile.targetRoleLabel ?? source.roleName;
  const projectText = source.practiceProjects.slice(0, 2).join("、");
  const workText = source.coreWork.slice(0, 3).join("、");

  const items: SimulationScenarioMeta[] = [];
  for (const rawTitle of source.simulationScenarios) {
    const base = roleScenarioMap[rawTitle];
    if (!base) continue;
    items.push({
      key: scenarioKeyForTitle(rawTitle),
      ...base,
      title: `${roleName} · ${rawTitle}`,
      role: roleName,
      objective: base.objective.replace("目标岗位", roleName),
      brief: `围绕「${workText}」等核心工作，${base.brief}`,
      openingMessage: `${base.openingMessage}

岗位背景：${roleName}，典型工作包括 ${workText}。可结合项目经历「${projectText || "岗位相关实践"}」回答。`,
      prompts: base.prompts.map((prompt) => `${prompt}
（请结合 ${roleName} 岗位场景回答）`),
    });
  }

  // 保证每个职业至少有一个训练场景
  if (items.length === 0) {
    items.push({
      key: "cross_role_communication",
      ...roleScenarioMap["跨岗位沟通"]!,
      title: `${roleName} · 跨岗位沟通`,
      role: roleName,
      objective: `围绕 ${roleName} 的核心工作，与协作方对齐目标、边界和验收标准。`,
      brief: `你正在推进 ${roleName} 的典型工作，协作方对范围、口径和节奏提出质疑。`,
      openingMessage: `你是 ${roleName} 岗位候选人，协作方质疑当前方案。请先说明核心问题、目标用户和最终业务目标。`,
      prompts: roleScenarioMap["跨岗位沟通"]!.prompts,
    });
  }

  items.push(buildCareerInterviewScenario(profile));
  return items;
}

export interface SimulationTranscriptTurn {
  role: "user" | "assistant";
  content: string;
  meta?: AiExecutionMeta;
}

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8_000),
  meta: z.object({
    requestedMode: z.enum(["api", "manual", "mock"]),
    actualMode: z.enum(["api", "manual", "mock"]),
    degraded: z.boolean(),
    fallbackReason: z.string().nullable(),
    source: z.string(),
  }).optional(),
});

export function parseSimulationTranscript(value: string): SimulationTranscriptTurn[] {
  const raw = parseJson<unknown>(value, []);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = turnSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function getSimulationScenario(key: SimulationScenarioKey) {
  return { key, ...scenarios[key] };
}

export function nextSimulationPrompt(key: SimulationScenarioKey, turnCount: number) {
  const prompts = scenarios[key].prompts;
  return prompts[Math.min(Math.max(turnCount - 1, 0), prompts.length - 1)]!;
}

export function containsSimulationTurnProtocol(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const candidates = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }

  return candidates.some((candidate) => {
    try {
      const parsed = JSON.parse(candidate) as { type?: unknown } | null;
      return parsed !== null
        && typeof parsed === "object"
        && !Array.isArray(parsed)
        && parsed.type === "simulation_turn";
    } catch {
      return false;
    }
  });
}

export function canCompleteSimulation(turnCount: number) {
  return turnCount >= 3 && turnCount <= 6;
}

export function simulationDto(session: {
  id: string; scenarioKey: string; scenarioTitle: string; transcript: string; score: number | null;
  feedback: string; status: string; turnCount: number; requestedMode: string; actualMode: string;
  candidateId: string | null; remoteConversationId?: string | null; createdAt: Date; updatedAt: Date;
}) {
  const parsedFeedback = parseJson<Record<string, unknown>>(session.feedback, {});
  // 优先从 feedback 中读取 V2 候选 ID（AgentArtifactCandidate），回退到旧的 candidateId 字段
  const resolvedCandidateId: string | null =
    (typeof parsedFeedback.artifactCandidateId === "string" && parsedFeedback.artifactCandidateId.trim())
      ? parsedFeedback.artifactCandidateId.trim()
      : session.candidateId;

  return {
    id: session.id,
    scenarioKey: session.scenarioKey,
    scenarioTitle: session.scenarioTitle,
    transcript: parseSimulationTranscript(session.transcript),
    score: session.score,
    feedback: parsedFeedback,
    status: session.status,
    turnCount: session.turnCount,
    requestedMode: session.requestedMode,
    actualMode: session.actualMode,
    candidateId: resolvedCandidateId,
    remoteConversationId: session.remoteConversationId ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}