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
