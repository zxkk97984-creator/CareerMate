import "server-only";
import {
  CAREERMATE_CONTEXT_TOKEN_SCOPES,
  signCareerMateContextToken,
  type ContextTokenSignOptions,
} from "@/lib/agent-context-auth";
import { agenticV2InteractionSchema } from "./schemas";
import type { z } from "zod";

export { agenticV2InteractionSchema } from "./schemas";
export type AgenticV2Interaction = z.infer<typeof agenticV2InteractionSchema>;

export interface AgenticV2BusinessData {
  schemaVersion: "1";
  careermate_context_token: string;
  interaction: AgenticV2Interaction;
}

interface BuildAgenticV2BusinessDataInput {
  userId: string;
  conversationId: string;
  clientRequestId: string;
  interaction?: AgenticV2Interaction;
}

const DEFAULT_INTERACTION: AgenticV2Interaction = {
  surface: "chat",
  action: "message_submit",
};

/**
 * Builds the only private context sent to the V2 Agent.
 * Authoritative profile/history data remains behind the scoped MCP tools.
 */
export function buildAgenticV2BusinessData(
  input: BuildAgenticV2BusinessDataInput,
  options: ContextTokenSignOptions = {},
): AgenticV2BusinessData {
  const interaction = agenticV2InteractionSchema.parse(input.interaction ?? DEFAULT_INTERACTION);
  const contextToken = signCareerMateContextToken({
    sub: input.userId,
    sid: input.conversationId,
    scopes: CAREERMATE_CONTEXT_TOKEN_SCOPES,
  }, {
    ...options,
    ttlSeconds: Math.min(options.ttlSeconds ?? 300, 600),
    randomUUID: () => input.clientRequestId,
  });

  return {
    schemaVersion: "1",
    careermate_context_token: contextToken,
    interaction,
  };
}
