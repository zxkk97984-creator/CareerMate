export interface RemoteConversationBinding {
  remoteConversationId?: string | null;
  remoteAgentId?: string | null;
  remoteAgentVersion?: string | null;
}

export interface CurrentAgentBinding {
  agentId: string;
  agentVersion?: string;
}

/** Prevents a provider conversation created by one Agent version from crossing into another. */
export function resolveBoundRemoteConversationId(
  stored: RemoteConversationBinding | null | undefined,
  current: CurrentAgentBinding,
): string | undefined {
  if (!stored?.remoteConversationId || !stored.remoteAgentId) return undefined;
  if (stored.remoteAgentId !== current.agentId) return undefined;
  if ((stored.remoteAgentVersion ?? null) !== (current.agentVersion ?? null)) return undefined;
  return stored.remoteConversationId;
}
