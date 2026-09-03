import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KurisuAvatar } from "./kurisu-avatar";

describe("KurisuAvatar (SSR)", () => {
  it("renders the Live2D iframe", () => {
    const html = renderToStaticMarkup(<KurisuAvatar />);
    expect(html).toContain("/live2d/index.html");
    expect(html).toContain("kurisu-avatar-frame");
    expect(html).not.toContain("opacity:0");
  });
});
