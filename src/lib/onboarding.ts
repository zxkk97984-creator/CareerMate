import { z } from "zod";

const cleanText = z.string().trim().min(1).max(240);
const cleanList = z
  .array(cleanText)
  .max(12)
  .transform((items) => [...new Set(items)]);

export const onboardingDraftSchema = z
  .object({
    educationStage: cleanText.optional(),
    major: cleanText.optional(),
    targetRole: z.enum(["ai_product_manager", "data_analyst", "aigc_operator"]).optional(),
    targetRoleLabel: cleanText.optional(),
    weeklyAvailableHours: z.number().int().min(1).max(40).optional(),
    learningPreference: cleanList.optional(),
    experienceSummary: cleanText.max(1_000).optional(),
    constraints: cleanList.optional(),
  })
  .strict();

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export interface OnboardingProfileUpdateCandidate {
  field: keyof OnboardingDraft;
  oldValue: unknown;
  newValue: unknown;
  confidence: number;
  requiresConfirmation: true;
  reason: string;
}

const roleAliases: Array<{ patterns: string[]; key: OnboardingDraft["targetRole"]; label: string }> = [
  { patterns: ["ai_product_manager", "AI 产品经理", "AI产品经理"], key: "ai_product_manager", label: "AI 产品经理" },
  { patterns: ["data_analyst", "数据分析师", "数据分析"], key: "data_analyst", label: "数据分析师" },
  { patterns: ["aigc_operator", "AIGC 内容运营", "AIGC内容运营", "AIGC 运营", "AIGC运营"], key: "aigc_operator", label: "AIGC 内容运营" },
];

const educationAliases: Array<{ patterns: string[]; value: string }> = [
  { patterns: ["转行", "转岗"], value: "career_switcher" },
  { patterns: ["研究生", "硕士", "博士"], value: "postgraduate" },
  { patterns: ["大四"], value: "senior" },
  { patterns: ["大三"], value: "junior" },
  { patterns: ["大二"], value: "sophomore" },
  { patterns: ["大一"], value: "freshman" },
  { patterns: ["已工作", "已经工作", "职场", "在职"], value: "worker" },
];

const preferenceAliases: Array<{ patterns: string[]; value: string }> = [
  { patterns: ["视频", "网课"], value: "video" },
  { patterns: ["阅读", "文字", "看书"], value: "text" },
  { patterns: ["项目", "作品"], value: "project" },
  { patterns: ["实操", "实践", "动手"], value: "practice" },
  { patterns: ["导师", "带教", "有人指导"], value: "mentor" },
];

function includesAny(message: string, patterns: string[]) {
  const normalized = message.toLocaleLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLocaleLowerCase()));
}

function extractMajor(message: string) {
  const patterns = [
    /大[一二三四]([\p{Script=Han}A-Za-z0-9]{2,16})专业/u,
    /(?:专业是|专业为|学的是|背景是)\s*([^，。！？,.]{2,20}?)(?:专业|，|。|！|？|,|\.|$)/u,
    /我是\s*([^，。！？,.]{2,20}?)专业/u,
  ];
  for (const pattern of patterns) {
    const value = message.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function extractHours(message: string) {
  const match = message.match(/(?:每周|一周|每星期|weekly)\s*(?:能|可|可以|大概)?\s*(?:投入|学习|安排)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:个)?(?:小时|h\b)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 1 && value <= 40 ? value : undefined;
}

function extractExperience(message: string) {
  return message.match(/((?:做过|曾经|有过|参与过|负责过)[^，。！？,.]{2,120})(?=[，。！？,.]|$)/u)?.[1]?.trim();
}

function extractConstraints(message: string) {
  if (/(?:没有|暂无|无)(?:什么|任何)?特殊限制/u.test(message)) return ["暂无特殊限制"];
  const constraints: string[] = [];
  if (/(?:时间有限|时间紧|没时间|时间比较少)/u.test(message)) constraints.push("时间有限");
  if (/(?:预算有限|预算不多|经济压力)/u.test(message)) constraints.push("预算有限");
  if (/(?:零基础|没有基础)/u.test(message)) constraints.push("零基础");
  const missing = message.match(/((?:缺少|缺乏)[^，。！？,.]{2,24})(?=[，。！？,.]|$)/u)?.[1]?.trim();
  if (missing) constraints.push(missing);
  return constraints.length > 0 ? constraints : undefined;
}

export function extractOnboardingDraft(message: string): OnboardingDraft {
  const text = message.trim();
  const draft: OnboardingDraft = {};
  const education = educationAliases.find((item) => includesAny(text, item.patterns));
  if (education) draft.educationStage = education.value;
  const major = extractMajor(text);
  if (major) draft.major = major;
  const role = roleAliases.find((item) => includesAny(text, item.patterns));
  if (role) {
    draft.targetRole = role.key;
    draft.targetRoleLabel = role.label;
  }
  const hours = extractHours(text);
  if (hours) draft.weeklyAvailableHours = hours;
  const preferences = preferenceAliases
    .filter((item) => includesAny(text, item.patterns))
    .map((item) => item.value);
  if (preferences.length > 0) draft.learningPreference = preferences;
  const experience = extractExperience(text);
  if (experience) draft.experienceSummary = experience;
  const constraints = extractConstraints(text);
  if (constraints) draft.constraints = constraints;
  return onboardingDraftSchema.parse(draft);
}

export function mergeOnboardingDraft(previous: OnboardingDraft, extracted: OnboardingDraft): OnboardingDraft {
  const merged: OnboardingDraft = { ...previous, ...extracted };
  if (previous.learningPreference || extracted.learningPreference) {
    merged.learningPreference = [...new Set([...(previous.learningPreference ?? []), ...(extracted.learningPreference ?? [])])];
  }
  if (previous.constraints || extracted.constraints) {
    const constraints = extracted.constraints?.includes("暂无特殊限制")
      ? extracted.constraints
      : [...new Set([...(previous.constraints ?? []).filter((item) => item !== "暂无特殊限制"), ...(extracted.constraints ?? [])])];
    merged.constraints = constraints;
  }
  return onboardingDraftSchema.parse(merged);
}

type OnboardingTranscriptTurn = {
  role: "user" | "assistant";
  content: string;
};

function bareMajorAnswer(message: string) {
  const value = message.trim().replace(/专业$/u, "").trim();
  if (value.length < 2 || value.length > 40) return undefined;
  if (/[？?！!。；;\n\r]/u.test(value)) return undefined;
  if (/(?:不知道|不清楚|没有|暂无|随便|还没想好)/u.test(value)) return undefined;
  return value;
}

export function extractOnboardingDraftForTurn(
  message: string,
  previous: OnboardingDraft,
): OnboardingDraft {
  const explicit = extractOnboardingDraft(message);
  if (
    Object.keys(explicit).length > 0 ||
    missingOnboardingGroups(previous)[0] !== "major"
  ) {
    return explicit;
  }
  const major = bareMajorAnswer(message);
  return onboardingDraftSchema.parse(major ? { major } : {});
}

export function rebuildOnboardingDraft(
  transcript: OnboardingTranscriptTurn[],
  storedDraft: OnboardingDraft,
): OnboardingDraft {
  const replayed = transcript.reduce((draft, turn) => {
    if (turn.role !== "user") return draft;
    return mergeOnboardingDraft(
      draft,
      extractOnboardingDraftForTurn(turn.content, draft),
    );
  }, {} as OnboardingDraft);
  return mergeOnboardingDraft(replayed, storedDraft);
}

const completeGroup = (value: unknown) =>
  typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : value !== undefined;

export function missingOnboardingGroups(draft: OnboardingDraft) {
  return [
    !completeGroup(draft.educationStage) && "educationStage",
    !completeGroup(draft.major) && "major",
    !(completeGroup(draft.targetRole) && completeGroup(draft.targetRoleLabel)) && "targetRole",
    !(typeof draft.weeklyAvailableHours === "number" && draft.weeklyAvailableHours >= 1 && draft.weeklyAvailableHours <= 40) && "weeklyAvailableHours",
    !completeGroup(draft.learningPreference) && "learningPreference",
    !completeGroup(draft.experienceSummary) && "experienceSummary",
    !completeGroup(draft.constraints) && "constraints",
  ].filter((value): value is string => Boolean(value));
}

export function calculateOnboardingCompleteness(draft: OnboardingDraft) {
  return (7 - missingOnboardingGroups(draft).length) / 7;
}

export function canCompleteOnboarding(completeness: number) {
  return completeness >= 0.8;
}

const nextQuestions: Record<string, string> = {
  educationStage: "你目前处于什么学习或工作阶段？例如大三、研究生、在职或准备转行。",
  major: "你的专业或主要背景是什么？",
  targetRole: "你最想发展的目标岗位是什么？目前支持 AI 产品经理、数据分析师和 AIGC 内容运营。",
  weeklyAvailableHours: "你每周大约能稳定投入多少小时学习和实践？",
  learningPreference: "你偏好哪种学习方式？例如视频、阅读、项目实操或导师带教。",
  experienceSummary: "你过去做过哪些与目标相关的课程、项目或工作？",
  constraints: "目前有哪些现实限制需要计划考虑？如果没有，也可以直接说没有特殊限制。",
};

export function nextOnboardingQuestion(draft: OnboardingDraft) {
  const missing = missingOnboardingGroups(draft)[0];
  return missing ? nextQuestions[missing] : "画像信息已经完整。请确认摘要，确认后我会正式更新你的职业画像。";
}

const candidateFieldOrder: Array<keyof OnboardingDraft> = [
  "educationStage",
  "major",
  "targetRole",
  "weeklyAvailableHours",
  "learningPreference",
  "experienceSummary",
  "constraints",
];

export function profileUpdateCandidateFromExtraction(
  previous: OnboardingDraft,
  extracted: OnboardingDraft,
): OnboardingProfileUpdateCandidate | undefined {
  const field = candidateFieldOrder.find((key) => extracted[key] !== undefined && JSON.stringify(previous[key]) !== JSON.stringify(extracted[key]));
  if (!field) return undefined;
  return {
    field,
    oldValue: previous[field],
    newValue: extracted[field],
    confidence: 0.9,
    requiresConfirmation: true,
    reason: "本轮对话识别到新的画像信息，仅在最终确认后写入正式画像。",
  };
}

export const supportedOnboardingRoles = roleAliases.map(({ key, label }) => ({ key, label }));
