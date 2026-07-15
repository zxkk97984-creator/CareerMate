import type { AgentQuestion } from "./agent-protocol";

export type QuestionLedgerStatus = "asked" | "answered" | "skipped" | "obsolete";

const VALID_STATUSES: ReadonlySet<string> = new Set(["asked", "answered", "skipped", "obsolete"]);
const NORMALIZED_KEY_RE = /^[a-z0-9:_-]{3,120}$/;

export function isValidNormalizedKey(key: string): boolean {
  return NORMALIZED_KEY_RE.test(key);
}

export interface QuestionLedgerEntry {
  id: string;
  conversationId: string;
  normalizedQuestionKey: string;
  profileVersion: number;
  questionText: string;
  profileField: string | null;
  status: QuestionLedgerStatus;
  answerSummary: string;
  askedAt: Date;
  answeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordQuestionInput {
  conversationId: string;
  profileVersion: number;
  question: AgentQuestion;
}

/** 判断给定版本下是否仍需提问：最近一条非 obsolete 记录状态为 asked 或 skipped 时需要追问 */
export function shouldAskQuestion(
  entries: Array<{ normalizedQuestionKey: string; status: string; profileVersion: number }>,
  key: string,
  currentProfileVersion: number,
): boolean {
  // 找到该 key 最近的非 obsolete 记录
  const recent = entries
    .filter((e) => e.normalizedQuestionKey === key && e.status !== "obsolete")
    .sort((a, b) => b.profileVersion - a.profileVersion)[0];

  // 无记录 → 需要提问
  if (!recent) return true;

  // 已回答 → 不需要
  if (recent.status === "answered") return false;
  // 已跳过且画像版本未变 → 本次任务中不重问
  if (recent.status === "skipped" && recent.profileVersion === currentProfileVersion) return false;
  // 已跳过但画像版本增加 → 可以重问
  if (recent.status === "skipped" && recent.profileVersion < currentProfileVersion) return true;
  // asked 状态且同版本 → 正在等待回答，不重复
  return false;
}

/** 规范化的问题键（仅允许安全格式，非法键丢弃） */
export function normalizeQuestionKey(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return isValidNormalizedKey(trimmed) ? trimmed : null;
}

/** 校验状态值合法性 */
export function isValidLedgerStatus(value: string): value is QuestionLedgerStatus {
  return VALID_STATUSES.has(value);
}
