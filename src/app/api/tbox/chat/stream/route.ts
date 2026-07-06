import { fail } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getTboxConfig } from "@/lib/env";
import { toJson } from "@/lib/json";
import { createMockChatChunks } from "@/lib/tbox";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const body = (await request.json()) as { question?: string };
  const question = body.question ?? "";
  const config = getTboxConfig();
  const chunks = createMockChatChunks(question);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "answer", content: chunk, mode: config.mode })}\n\n`));
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  });

  await getPrisma().progressLog.create({
    data: {
      userId: user.id,
      eventType: "chat",
      title: "与 CareerMate 对话",
      summary: question.slice(0, 120),
      metadata: toJson({ mode: config.mode }),
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
