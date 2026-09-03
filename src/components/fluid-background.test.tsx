import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FluidBackground } from "./fluid-background";

describe("FluidBackground (SSR)", () => {
  it("renders all layers without inline opacity", () => {
    const html = renderToStaticMarkup(<FluidBackground />);
    expect(html).toContain("fluid-bg");
    for (const layer of ["fblob-1", "fblob-2", "fblob-3", "fblob-4", "fblob-5", "fconstellation", "fspot", "fdot", "fgrain"]) {
      expect(html).toContain(layer);
    }
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
  });

  it("is hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<FluidBackground />);
    expect(html).toContain('aria-hidden="true"');
  });
});
