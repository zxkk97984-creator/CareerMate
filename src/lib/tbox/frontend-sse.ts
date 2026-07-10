export interface FrontendSseBlock {
  event: string;
  data: Record<string, unknown>;
}

export function parseFrontendSseBlock(block: string): FrontendSseBlock | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r\n|\r|\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim() || "message";
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join("\n"));
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? { event, data: data as Record<string, unknown> }
      : null;
  } catch {
    return null;
  }
}

export async function consumeFrontendSseResponse(
  response: Response,
  onDelta: (content: string) => void,
) {
  if (!response.ok) throw new Error("对话请求失败");
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    throw new Error("对话服务返回了无效响应");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("对话服务暂时不可用");
  const decoder = new TextDecoder();
  let buffer = "";
  let readerDone = false;
  let completed = false;

  function boundary() {
    const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
    return match ? { index: match.index, length: match[0].length } : null;
  }

  function consume(block: string) {
    const parsed = parseFrontendSseBlock(block);
    if (!parsed) throw new Error("流式响应格式无效");
    if (parsed.event === "error") {
      throw new Error(
        typeof parsed.data.message === "string" ? parsed.data.message : "对话服务暂时不可用",
      );
    }
    if (
      parsed.event === "message" &&
      parsed.data.type === "delta" &&
      typeof parsed.data.content === "string"
    ) {
      onDelta(parsed.data.content);
    }
    if (parsed.event === "done") completed = true;
  }

  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let delimiter = boundary();
      while (delimiter) {
        consume(buffer.slice(0, delimiter.index));
        buffer = buffer.slice(delimiter.index + delimiter.length);
        if (completed) break;
        delimiter = boundary();
      }
      if (done) {
        readerDone = true;
        break;
      }
    }
    if (!completed && buffer.trim()) consume(buffer);
    if (!completed) throw new Error("流式响应未正常结束");
  } finally {
    if (!readerDone) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
        // The browser may already have closed or errored the stream.
      }
    }
    reader.releaseLock();
  }
}
