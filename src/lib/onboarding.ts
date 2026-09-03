import { resolveRoleIdentity, resolveSeedRoleAlias } from "@/lib/roles/identity";
import { missingOnboardingGroups, onboardingDraftSchema, type OnboardingDraft } from "./onboarding-utils";

export { onboardingDraftSchema, type OnboardingDraft };

export interface OnboardingProfileUpdateCandidate {
  field: keyof OnboardingDraft;
  oldValue: unknown;
  newValue: unknown;
  confidence: number;
  requiresConfirmation: true;
  reason: string;
}

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
  // 匹配多种小时表达：带前缀"每周10小时"、纯数字"10个小时吧"、"大概10个小时"等
  const patterns = [
    // 带时间单位前缀
    /(?:每周|一周|每星期|weekly)\s*(?:能|可|可以|大概)?\s*(?:投入|学习|安排)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:个)?(?:小时|h\b)/i,
    // 纯数字+小时（无前缀）——如"10个小时吧"、"大概10小时"
    /(?:大概|大约|差不多|可能)?\s*(\d{1,2})\s*个?(?:小时|h\b)/i,
    // 结尾纯数字——如"10"、"10个"（在关于时间的问题语境下）
    /(?:^|\s)(\d{1,2})\s*个?\s*$/m,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 40) return value;
    }
  }
  return undefined;
}

/** 通用岗位提取——任意文本中识别目标岗位（不依赖白名单） */
function extractTargetRole(message: string): { key: string; label: string } | undefined {
  const text = message.trim();
  if (!text) return undefined;
  // 否定输入——用户表达还没想好/不确定
  if (/^(?:还没想好|不知道|没想好|不确定|不清楚|没有|暂无|随便|都行|都可以|无所谓)\s*$/u.test(text)) return undefined;
  if (text.length > 120) return undefined;
  // 通用职业表达模式（与 context-builder 对齐）
  const roleMatch = text.match(/(?:我想成为|我想做|我想当|我打算做|我想从事|目标是|转行做|想成为|想做|当个|成为|考虑|准备做)\s*(.{2,40}?)(?:[，,。.、]|$)/u);
  if (roleMatch) {
    const raw = roleMatch[1].trim();
    const identity = resolveRoleIdentity(raw);
    return { key: identity.key, label: identity.label };
  }
  // 裸角色名（含角色后缀的短文本 或 英文缩写）——仅当文本有角色特征时才提取
  if (text.length <= 30 && !/[？?！!\n\r]/u.test(text)) {
    const hasRoleSuffix = /(?:师|员|家|匠|工|手|生)(?:\s|$)/u.test(text);
    const isAbbrev = /^[A-Za-z]{2,8}$/.test(text) && !/^[a-z]{1,2}$/i.test(text);
    // 种子别名命中（如 AI产品经理、data_analyst 等无后缀已知角色）
    const seedHit = resolveSeedRoleAlias(text);
    if (hasRoleSuffix || isAbbrev || seedHit) {
      if (/^(?:还没想好|不知道|没想好|不确定|不清楚|没有|暂无|随便)\s*$/u.test(text)) return undefined;
      const identity = seedHit ?? resolveRoleIdentity(text);
      return { key: identity.key, label: identity.label };
    }
    // 后备：文本中包含种子角色关键词（如"目标 data_analyst"、"考虑 AIGC 内容运营"）
    if (text.length <= 50) {
      // 仅对种子已知角色做子串匹配——不扩展到任意文本
      const seedTerms = [
        "data_analyst", "数据分析师", "数据分析",
        "ai_product_manager", "AI 产品经理", "AI产品经理", "ai产品经理",
        "aigc_operator", "AIGC 内容运营", "AIGC内容运营", "AIGC运营", "aigc运营", "AIGC 运营",
        "database_administrator", "数据库管理员", "数据库运维", "DBA", "dba",
      ];
      for (const term of seedTerms) {
        if (text.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
          const hit = resolveSeedRoleAlias(term);
          if (hit) return { key: hit.key, label: hit.label };
        }
      }
    }
  }
  return undefined;
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
  // 通用岗位提取——任意职业均可识别，白名单仅用于规范化已知角色
  const role = extractTargetRole(text);
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
  if (Object.keys(explicit).length > 0) return explicit;
  const currentMissing = missingOnboardingGroups(previous)[0];
  // 正在追 ask major —— 裸回答
  if (currentMissing === "major") {
    const major = bareMajorAnswer(message);
    if (major) return onboardingDraftSchema.parse({ major });
  }
  // 正在追 ask targetRole —— 裸回答（任意职业，不依赖白名单）
  if (currentMissing === "targetRole") {
    const role = extractTargetRole(message);
    if (role) return onboardingDraftSchema.parse({ targetRole: role.key, targetRoleLabel: role.label });
    // 无后缀的短文本也视为可能的角色名（例如英文职位或生僻岗位名）
    const trimmed = message.trim();
    if (trimmed.length >= 2 && trimmed.length <= 40 && !/[？?！!\n\r]/u.test(trimmed) && !/^(?:还没想好|不知道|没想好|不确定|不清楚|没有|暂无|随便)/u.test(trimmed)) {
      const identity = resolveRoleIdentity(trimmed);
      return onboardingDraftSchema.parse({ targetRole: identity.key, targetRoleLabel: identity.label });
    }
  }
  return onboardingDraftSchema.parse({});
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

export {
  missingOnboardingGroups,
  calculateOnboardingCompleteness,
  canCompleteOnboarding,
} from "./onboarding-utils";

const nextQuestions: Record<string, string> = {
  educationStage: "你目前处于什么学习或工作阶段？例如大三、研究生、在职或准备转行。",
  major: "你的专业或主要背景是什么？",
  targetRole: "你目前最想探索或发展的岗位是什么？任何职业都可以；如果还没想好，也可以先聊兴趣和优势。",
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

// 种子角色（用于 UI 示例，非准入白名单；任意职业均可通过 extractTargetRole 识别）
export const supportedOnboardingRoles = [
  { key: "database_administrator", label: "数据库管理员（DBA）" },
  { key: "ai_product_manager", label: "AI 产品经理" },
  { key: "data_analyst", label: "数据分析师" },
  { key: "aigc_operator", label: "AIGC 内容运营" },
];
