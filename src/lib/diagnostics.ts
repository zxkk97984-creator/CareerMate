import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * T24：脱敏诊断与运行记录（最小实现）。
 * 区分业务事件（ProgressLog）与技术诊断：本模块只记录运行元信息，
 * 绝不接收聊天正文 / 密码 / 令牌等敏感内容。
 *
 * 记录字段：requestId、operation、elapsedMs、mode、degraded、errorCode、source、ts。
 * 无敏感正文；本地 JSONL 追加，不外发、不建后台。
 */

export type DiagnosticMode = "api" | "manual" | "mock";

export interface DiagnosticEntry {
  requestId?: string;
  operation: string;
  elapsedMs?: number;
  mode: DiagnosticMode;
  degraded?: boolean;
  errorCode?: string;
  source?: string;
  /** 业务事件去重键：同 key 只记录一次，避免重复计数（T24） */
  dedupeKey?: string;
  ts?: string;
}

/** 敏感字段名（大小写不敏感），遇到即删除——防御性脱敏，防止误传敏感正文。 */
const SENSITIVE_KEY_PATTERN = /^(password|token|secret|credential|message|content|transcript|body|chat|prompt|authorization|cookie|session)$/i;

/** 防御性脱敏任意对象：删除敏感键、截断超长字符串。不记录正文。 */
export function redactForDiagnostics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForDiagnostics);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) continue;
      out[k] = redactForDiagnostics(v);
    }
    return out;
  }
  if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value;
  return value;
}

/** 模式分离：api 与 mock/manual 分开标记，便于计算真实 AI 延迟/降级率。 */
export function isMock(mode: DiagnosticMode): boolean {
  return mode === "mock";
}

/** 归一化为一行 JSONL 字符串 */
export function toDiagnosticLine(entry: DiagnosticEntry): string {
  const safe = redactForDiagnostics(entry) as Record<string, unknown>;
  return JSON.stringify({ ts: entry.ts ?? new Date().toISOString(), ...safe });
}

// ── 本地 JSONL 追加 ──────────────────────────────────────

/** 默认日志目录（可用环境变量覆盖） */
function logDir(): string {
  const base = process.env.CAREMATE_DIAGNOSTIC_DIR ?? join(process.cwd(), ".diagnostics");
  return base;
}

/** 去重键集合（进程内；足够避免同一会话内的重复事件计数） */
const seenKeys = new Set<string>();

/**
 * 记录一条诊断（追加 JSONL）。business 事件用 dedupeKey 去重，避免重复计数。
 * 写入失败静默降级（诊断日志不能阻断主流程）。
 */
export function logDiagnostic(entry: DiagnosticEntry): boolean {
  if (entry.dedupeKey) {
    if (seenKeys.has(entry.dedupeKey)) return false;
    seenKeys.add(entry.dedupeKey);
  }
  try {
    const dir = logDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = join(dir, isMock(entry.mode) ? "diagnostics.mock.jsonl" : "diagnostics.jsonl");
    appendFileSync(file, toDiagnosticLine(entry) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}
