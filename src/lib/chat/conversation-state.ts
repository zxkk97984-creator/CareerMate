// ── 会话状态类型与解析 ──────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  value: string;
}

export interface AwaitingQuestion {
  id: string;
  normalizedKey: string;
  text: string;
  profileField?:
    | "educationStage"
    | "major"
    | "targetRole"
    | "weeklyAvailableHours"
    | "learningPreference"
    | "experienceSummary"
    | "constraints";
  answerKind: "free_text" | "number" | "single_choice" | "confirmation";
  actions: QuickAction[];
  askedAt: string;
}

export interface ConversationTask {
  kind:
    | "idle"
    | "profile_guidance"
    | "career_research"
    | "plan_generation"
    | "plan_revision"
    | "general";
  status: "idle" | "collecting" | "ready" | "waiting_confirmation" | "completed";
  goal?: string;
  answers: Record<string, string>;
}

export interface ConversationState {
  schemaVersion: 1;
  currentTask: ConversationTask;
  awaitingQuestion: AwaitingQuestion | null;
}

// ── 常量 ────────────────────────────────────────

const VALID_TASK_KINDS = new Set<string>([
  "idle",
  "profile_guidance",
  "career_research",
  "plan_generation",
  "plan_revision",
  "general",
]);

const VALID_TASK_STATUSES = new Set<string>([
  "idle",
  "collecting",
  "ready",
  "waiting_confirmation",
  "completed",
]);

const VALID_ANSWER_KINDS = new Set<string>([
  "free_text",
  "number",
  "single_choice",
  "confirmation",
]);

const VALID_PROFILE_FIELDS = new Set<string>([
  "educationStage",
  "major",
  "targetRole",
  "weeklyAvailableHours",
  "learningPreference",
  "experienceSummary",
  "constraints",
]);

// ── 默认状态 ────────────────────────────────────

export function defaultConversationState(): ConversationState {
  return {
    schemaVersion: 1,
    currentTask: { kind: "idle", status: "idle", answers: {} },
    awaitingQuestion: null,
  };
}

// ── 解析 ────────────────────────────────────────

function isValidQuickAction(a: unknown): a is QuickAction {
  if (typeof a !== "object" || a === null) return false;
  const obj = a as Record<string, unknown>;
  return (
    typeof obj.id === "string" && obj.id.trim().length > 0 &&
    typeof obj.label === "string" && obj.label.trim().length > 0 &&
    typeof obj.value === "string" && obj.value.trim().length > 0
  );
}

function isValidAwaitingQuestion(q: unknown): q is AwaitingQuestion {
  if (typeof q !== "object" || q === null) return false;
  const obj = q as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.normalizedKey !== "string" ||
    typeof obj.text !== "string" ||
    typeof obj.askedAt !== "string" ||
    !VALID_ANSWER_KINDS.has(String(obj.answerKind))
  ) {
    return false;
  }
  if (obj.profileField !== undefined && obj.profileField !== null) {
    if (!VALID_PROFILE_FIELDS.has(String(obj.profileField))) return false;
  }
  if (!Array.isArray(obj.actions) || !obj.actions.every(isValidQuickAction)) return false;
  return true;
}

function parseConversationTask(raw: unknown): ConversationTask {
  if (typeof raw !== "object" || raw === null) {
    return { kind: "idle", status: "idle", answers: {} };
  }
  const obj = raw as Record<string, unknown>;
  const kind = String(obj.kind ?? "idle");
  const status = String(obj.status ?? "idle");
  if (!VALID_TASK_KINDS.has(kind) || !VALID_TASK_STATUSES.has(status)) {
    return { kind: "idle", status: "idle", answers: {} };
  }
  return {
    kind: kind as ConversationTask["kind"],
    status: status as ConversationTask["status"],
    goal: typeof obj.goal === "string" ? obj.goal : undefined,
    answers:
      typeof obj.answers === "object" && obj.answers !== null && !Array.isArray(obj.answers)
        ? (obj.answers as Record<string, string>)
        : {},
  };
}

export function parseConversationState(raw: string | null): ConversationState {
  if (!raw || !raw.trim()) return defaultConversationState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultConversationState();
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return defaultConversationState();
  }

  const obj = parsed as Record<string, unknown>;

  // schemaVersion 必须是 1
  if (obj.schemaVersion !== 1) return defaultConversationState();

  const currentTask = parseConversationTask(obj.currentTask);

  let awaitingQuestion: AwaitingQuestion | null = null;
  if (obj.awaitingQuestion !== null && obj.awaitingQuestion !== undefined) {
    if (isValidAwaitingQuestion(obj.awaitingQuestion)) {
      awaitingQuestion = obj.awaitingQuestion;
    }
  }

  return {
    schemaVersion: 1,
    currentTask,
    awaitingQuestion,
  };
}
