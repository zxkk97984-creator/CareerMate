/**
 * T06a 助手控制器的纯逻辑部分（可单测）：clientRequestId 生命周期与当前流订阅隔离。
 *
 * - clientRequestId：一条“逻辑发送”在其生命周期内保持不变，用于服务端幂等去重。
 *   只有开始一条新的提问才生成新 ID；同一逻辑发送在网络失败后重试必须复用原 ID，
 *   避免制造重复用户消息/候选。
 * - 订阅隔离：切换到另一会话时，通知当前流订阅取消，且旧会话的加增量不得写入新会话。
 */

export interface RequestIdState {
  /** 当前逻辑发送的 clientRequestId；空闲时为 null。 */
  current: string | null;
  /** 这是否是重试（true 时复用 current，而不是生成新 ID）。 */
  retrying: boolean;
}

export function newRequestId(now: () => string = cryptoLikeUuid): string {
  return now();
}

function cryptoLikeUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 决定一次发送要使用的 clientRequestId。
 * - 没有进行中的发送 → 生成新 ID（新提问）。
 * - 当前有发送且收到异常 → 复用现有 ID（重试），保证服务端幂等。
 */
export function resolveClientRequestId(state: RequestIdState, isRetry: boolean): string {
  if (isRetry && state.current) return state.current;
  return newRequestId();
}

/** 订阅令牌：每次开始接收一个会话的流式响应时新建；切换会话时递增使旧订阅失效。 */
export interface SubscriptionGuard {
  /** 当前活跃的订阅序号；-1 表示无进行中订阅。 */
  seq: number;
}

export function beginSubscription(guard: { seq: number }): number {
  return guard.seq + 1;
}

/** 判断某订阅序号是否仍是当前活跃订阅（否则旧流不得写入）。 */
export function isCurrentSubscription(guard: { seq: number }, candidate: number): boolean {
  return guard.seq === candidate;
}
