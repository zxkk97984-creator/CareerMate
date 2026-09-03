import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingMotion } from "./landing-motion";

describe("LandingMotion (SSR)", () => {
  it("renders children visible", () => {
    const html = renderToStaticMarkup(
      <LandingMotion>
        <section className="landing-new-hero">
          <h1 className="landing-new-title">标题</h1>
        </section>
      </LandingMotion>,
    );
    expect(html).toContain("标题");
    expect(html).toContain("landing-new-hero");
    expect(html).not.toContain("opacity:0");
  });
});
