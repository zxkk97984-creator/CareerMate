import { z } from "zod";
import { parseJson } from "@/lib/json";
import type { AiExecutionMeta } from "@/lib/types";

const executionMetaSchema = z.object({
  requestedMode: z.enum(["api", "manual", "mock"]),
  actualMode: z.enum(["api", "manual", "mock"]),
  degraded: z.boolean(),
  fallbackReason: z.string().nullable(),
  source: z.string().min(1),
});

const transcriptTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const executionTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  meta: executionMetaSchema,
});

export interface SafeOnboardingTranscriptTurn {
  role: "user" | "assistant";
  content: string;
  meta?: AiExecutionMeta;
}

export function parseOnboardingTranscript(value: string): SafeOnboardingTranscriptTurn[] {
  const stored = parseJson<unknown>(value, null);
  if (!Array.isArray(stored)) return [];

  return stored.flatMap((candidate) => {
    const turn = transcriptTurnSchema.safeParse(candidate);
    if (!turn.success) return [];

    const meta = executionMetaSchema.safeParse(
      typeof candidate === "object" && candidate !== null && "meta" in candidate
        ? candidate.meta
        : undefined,
    );
    return [{
      ...turn.data,
      ...(meta.success ? { meta: meta.data } : {}),
    }];
  });
}

export function parseOnboardingExecutionMetadata(value: string): AiExecutionMeta[] {
  const stored = parseJson<unknown>(value, null);
  if (!Array.isArray(stored)) return [];

  return stored.flatMap((candidate) => {
    const turn = executionTurnSchema.safeParse(candidate);
    return turn.success ? [turn.data.meta] : [];
  });
}
