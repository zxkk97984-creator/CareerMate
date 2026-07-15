import type { AgentResponse } from "./agent-protocol";
import type { CitationObservation } from "../tbox/probe-judge";

// ── 轮次状态 ────────────────────────────────────

export interface ClaimedTurn {
  id: string;
  conversationId: string;
  userId: string;
  clientRequestId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export interface PersistedTurn {
  assistantText: string;
  agentResponse?: AgentResponse;
  citations: CitationObservation[];
  remoteConversationId?: string;
  warnings: string[];
}

export interface FinalizedTurn extends PersistedTurn {
  turnId: string;
}

export interface TurnBeginInput {
  userId: string;
  conversationId: string;
  message: string;
  clientRequestId: string;
  actionId?: string;
}

export interface TurnFinalizeInput {
  turn: ClaimedTurn;
  assistantText: string;
  agentResponse?: AgentResponse;
  citations: CitationObservation[];
  remoteConversationId?: string;
  warnings: string[];
}

// ── 接口 ────────────────────────────────────────

export interface ChatTurnService {
  begin(input: TurnBeginInput): Promise<
    { kind: "new"; turn: ClaimedTurn } | { kind: "replay"; turn: PersistedTurn }
  >;
  finalize(input: TurnFinalizeInput): Promise<FinalizedTurn>;
  fail(input: { turn: ClaimedTurn; partialText: string; code: string }): Promise<void>;
}

// ── 桩实现（完整实现在 Task 10）─────────────────

export function createTurnService(_opts?: Record<string, unknown>): ChatTurnService {
  void _opts;
  throw new Error("TurnService 完整实现在 Task 10 中完成");
}
