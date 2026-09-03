import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./chat-composer";

describe("ChatComposer (SSR)", () => {
  it("renders composer and send button without inline opacity", () => {
    const html = renderToStaticMarkup(
      <ChatComposer onSend={vi.fn()} disabled={false} activeConversationId="c1" />,
    );
    expect(html).toContain('class="send-btn"');
    expect(html).toContain("输入你的问题");
    expect(html).not.toContain("opacity:0");
  });
});

describe("ChatComposer send-btn motion wiring", () => {
  it("wires press/release/send-pulse motion to the send button", () => {
    const src = readFileSync(new URL("./chat-composer.tsx", import.meta.url), "utf8");
    expect(src).toContain("useMotionSafe");
    expect(src).toContain("sendBtnRef");
    expect(src).toContain("scale: 0.96");
    expect(src).toContain('back.out(1.4)');
    expect(src).toContain("scale: 1.03");
    expect(src).toContain("onPointerDown={pressSend}");
    expect(src).toContain("onPointerUp={releaseSend}");
    expect(src).toContain("onPointerLeave={releaseSend}");
  });
});
