import { recoverAiRuntime, type AiRuntimeSnapshot } from "@/lib/ai-runtime";
import {
  calculateOnboardingCompleteness,
  onboardingDraftSchema,
  type OnboardingDraft,
} from "@/lib/onboarding-utils";
import { parseJson } from "@/lib/json";
import { parseOnboardingTranscript } from "@/lib/onboarding-transcript";
import type { AiMode } from "@/lib/types";

export interface OnboardingTranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ActiveOnboardingConversation {
  id: string;
  status: "active";
  transcript: OnboardingTranscriptMessage[];
  draft: OnboardingDraft;
  completeness: number;
  executionMeta: AiRuntimeSnapshot;
}

interface StoredActiveOnboardingConversation {
  id: string;
  status: string;
  transcript: string;
  draft: string;
  completeness: number;
  requestedMode: string;
  actualMode: string;
}

export const onboardingGreeting =
  "你好，我会通过几轮简短对话了解你的阶段、目标和现实条件。你目前处于什么学习或工作阶段？";

export function recoverActiveOnboardingConversation(
  conversation: StoredActiveOnboardingConversation | null,
  requestedMode: AiMode,
): ActiveOnboardingConversation | null {
  if (!conversation || conversation.status !== "active") return null;

  const transcript = parseOnboardingTranscript(conversation.transcript);
  const draftResult = onboardingDraftSchema.safeParse(parseJson<unknown>(conversation.draft, null));
  const draft = draftResult.success ? draftResult.data : {};

  return {
    id: conversation.id,
    status: "active",
    transcript: transcript.map(({ role, content }) => ({ role, content })),
    draft,
    completeness: calculateOnboardingCompleteness(draft),
    executionMeta: recoverAiRuntime(requestedMode, conversation),
  };
}

export function createOnboardingInitialState(conversation: ActiveOnboardingConversation | null) {
  return {
    conversationId: conversation?.id,
    draft: conversation?.draft ?? {},
    completeness: conversation?.completeness ?? 0,
    messages: conversation?.transcript.length
      ? conversation.transcript
      : [{ role: "assistant" as const, content: onboardingGreeting }],
  };
}
