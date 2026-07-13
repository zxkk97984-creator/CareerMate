import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { parseJson, toJson } from "@/lib/json";
import {
  calculateOnboardingCompleteness,
  extractOnboardingDraftForTurn,
  mergeOnboardingDraft,
  missingOnboardingGroups,
  nextOnboardingQuestion,
  onboardingDraftSchema,
  profileUpdateCandidateFromExtraction,
  rebuildOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboarding";
import { getPrisma } from "@/lib/prisma";
import { parseOnboardingTranscript } from "@/lib/onboarding-transcript";
import { chatWithTbox } from "@/lib/tbox/adapter";

const onboardingChatSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationId: z.string().trim().min(1).max(100).optional(),
});

function safeStoredDraft(value: string): OnboardingDraft {
  const parsed = onboardingDraftSchema.safeParse(parseJson<unknown>(value, {}));
  return parsed.success ? parsed.data : {};
}

function buildApiPrompt(message: string, draft: OnboardingDraft) {
  return [
    "你是 CareerMate 的画像引导助手。只根据用户本轮输入和以下安全画像上下文作答。",
    `当前画像草稿：${JSON.stringify(draft)}`,
    `仍缺少的信息组：${JSON.stringify(missingOnboardingGroups(draft))}`,
    `用户本轮输入：${message}`,
    "简短回应已识别的信息，然后只追问一个最优先缺失项；不要声称已写入正式画像。",
  ].join("\n");
}

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsed = onboardingChatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", "画像对话参数不合法", 400, parsed.error.flatten());

  const prisma = getPrisma();
  const config = getTboxConfig();
  let conversation;
  if (parsed.data.conversationId) {
    conversation = await prisma.onboardingConversation.findUnique({ where: { id: parsed.data.conversationId } });
    if (!conversation || conversation.userId !== user.id) {
      return fail("CONVERSATION_NOT_FOUND", "画像对话不存在", 404);
    }
    if (conversation.status !== "active") {
      return fail("CONVERSATION_NOT_ACTIVE", "画像对话已经完成", 409);
    }
  } else {
    conversation = await prisma.onboardingConversation.create({
      data: {
        userId: user.id,
        transcript: "[]",
        draft: "{}",
        completeness: 0,
        status: "active",
        requestedMode: config.mode,
        actualMode: config.mode,
      },
    });
  }

  const transcript = parseOnboardingTranscript(conversation.transcript);
  const storedDraft = safeStoredDraft(conversation.draft);
  const previousDraft = rebuildOnboardingDraft(transcript, storedDraft);
  const extracted = extractOnboardingDraftForTurn(parsed.data.message, previousDraft);
  const draft = mergeOnboardingDraft(previousDraft, extracted);
  const completeness = calculateOnboardingCompleteness(draft);
  const deterministicQuestion = nextOnboardingQuestion(draft);

  const result = await chatWithTbox(
    {
      question: buildApiPrompt(parsed.data.message, draft),
      userId: user.id,
      ...(conversation.remoteConversationId ? { conversationId: conversation.remoteConversationId } : {}),
      context: { draft, missingGroups: missingOnboardingGroups(draft) },
    },
    { config },
  );
  const executionMeta = result.meta;
  let assistantMessage = deterministicQuestion;
  if (result.meta.actualMode === "api" && result.data.text.trim()) {
    assistantMessage = result.data.text.trim();
  }

  transcript.push(
    { role: "user", content: parsed.data.message },
    { role: "assistant", content: assistantMessage, meta: executionMeta },
  );
  const updateResult = await prisma.onboardingConversation.updateMany({
    where: {
      id: conversation.id,
      userId: user.id,
      status: "active",
      updatedAt: conversation.updatedAt,
    },
    data: {
      transcript: toJson(transcript),
      draft: toJson(draft),
      completeness,
      requestedMode: executionMeta.requestedMode,
      actualMode: executionMeta.actualMode,
      remoteConversationId:
        result.data.conversationId ?? conversation.remoteConversationId,
    },
  });
  if (updateResult.count === 0) {
    return fail("CONVERSATION_CHANGED", "画像对话已被更新，请刷新后重试", 409);
  }

  const profileUpdateCandidate = profileUpdateCandidateFromExtraction(previousDraft, extracted);
  return ok(
    {
      assistantMessage,
      conversationId: conversation.id,
      draft,
      profileCompleteness: completeness,
      ...(profileUpdateCandidate ? { profileUpdateCandidate } : {}),
    },
    executionMeta as unknown as Record<string, unknown>,
  );
}
