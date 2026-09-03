import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FluidBackground } from "./fluid-background";

describe("FluidBackground (SSR)", () => {
  it("renders the light-field layers without inline opacity", () => {
    const html = renderToStaticMarkup(<FluidBackground />);
    expect(html).toContain("fluid-bg");
    expect(html).toContain("fblob-1");
    expect(html).toContain("fblob-2");
    expect(html).toContain("fspot");
    expect(html).toContain("fdot");
    expect(html).toContain("fgrain");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
  });

  it("is hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<FluidBackground />);
    expect(html).toContain('aria-hidden="true"');
  });
});
