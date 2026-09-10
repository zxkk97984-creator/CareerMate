import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatProgress } from "./chat-progress";

describe("ChatProgress", () => {
  it("keeps a visible status after partial text has arrived", () => {
    const html = renderToStaticMarkup(<ChatProgress startedAt={new Date(Date.now() - 65_000).toISOString()} content="开始调用工具" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("65");
    expect(html).toContain("回答会自动恢复");
  });
});
