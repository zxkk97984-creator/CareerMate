import { fail } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prepareCareerChat } from "@/lib/chat/server";
import { getTboxConfig } from "@/lib/env";
import { toJson } from "@/lib/json";
import { getPrisma } from "@/lib/prisma";
import { chatInputSchema } from "@/lib/tbox/schemas";
import { streamChatWithTbox } from "@/lib/tbox/streaming";

function queryInput(request: Request) {
  const url = new URL(request.url);
  const context = url.searchParams.get("context");
  let parsedContext: Record<string, unknown> | undefined;
  if (context) {
    try {
      const value = JSON.parse(context);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        parsedContext = value as Record<string, unknown>;
      }
    } catch {
      parsedContext = undefined;
    }
  }
  return {
    question: url.searchParams.get("question") ?? "",
    conversationId: url.searchParams.get("conversationId") ?? undefined,
    context: parsedContext,
  };
}

async function handle(request: Request, rawInput: unknown) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const parsed = chatInputSchema.safeParse(rawInput);
  if (!parsed.success) return fail("INVALID_INPUT", "对话参数不合法", 400);
  const prepared = await prepareCareerChat({
    userId: user.id,
    question: parsed.data.question,
  });
  const result = await streamChatWithTbox(
    {
      question: prepared.enhancedQuestion,
      userId: user.id,
      conversationId: parsed.data.conversationId,
    },
    { config: getTboxConfig(), signal: request.signal },
  );

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "chat",
      title: "与 CareerMate 对话",
      summary: parsed.data.question.slice(0, 120),
      metadata: toJson(result.meta),
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: context\ndata: ${JSON.stringify(prepared.contextMeta)}\n\n`),
      );
      for (const event of result.data.events) {
        controller.enqueue(
          encoder.encode(
            `event: ${event.event}\ndata: ${JSON.stringify({ ...event.data, meta: result.meta })}\n\n`,
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  return handle(request, await request.json().catch(() => null));
}

export async function GET(request: Request) {
  return handle(request, queryInput(request));
}
