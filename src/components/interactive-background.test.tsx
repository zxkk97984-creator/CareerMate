import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveBackground } from "./interactive-background";

describe("InteractiveBackground (SSR)", () => {
  it("renders the background layers visible", () => {
    const html = renderToStaticMarkup(<InteractiveBackground />);
    expect(html).toContain("interactive-bg");
    expect(html).toContain("ibg-blob-1");
    expect(html).toContain("ibg-grid");
    expect(html).not.toContain("opacity:0");
  });
});
