import { z } from "zod";

const citationSchema = z.object({
  title: z.string().trim().min(1).max(240),
  source: z.string().trim().min(1).max(240),
  url: z.string().url().optional(),
  accessedAt: z.string().trim().min(1).max(40).optional(),
  label: z.enum(["已核验职业库", "实时联网调研", "AI分析与推断"]),
});

export const chatMessagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(32_000) }),
  z.object({ type: z.literal("citations"), items: z.array(citationSchema).min(1).max(12) }),
  z.object({ type: z.literal("profile_candidate_ref"), candidateId: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("plan_ref"), planId: z.string().trim().min(1).max(100), version: z.number().int().min(1) }),
  z.object({ type: z.literal("exploration_report_ref"), reportId: z.string().trim().min(1).max(100) }),
  z.object({
    type: z.literal("error"),
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500),
  }),
]);

export const chatMessagePartsSchema = z.array(chatMessagePartSchema).max(32);
export type ChatMessagePart = z.infer<typeof chatMessagePartSchema>;

export function parseChatMessageParts(value: string): ChatMessagePart[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((part) => {
      const result = chatMessagePartSchema.safeParse(part);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function titleFromFirstMessage(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  return normalized.length > 22 ? `${normalized.slice(0, 22)}…` : normalized;
}
