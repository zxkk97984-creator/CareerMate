import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reveal } from "./reveal";

describe("Reveal (SSR)", () => {
  it("renders children visible by default", () => {
    const html = renderToStaticMarkup(
      <Reveal variant="card">
        <p>卡片</p>
      </Reveal>,
    );
    expect(html).toContain("卡片");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("opacity: 0");
  });

  it("supports custom class", () => {
    const html = renderToStaticMarkup(
      <Reveal className="x">
        <p>a</p>
      </Reveal>,
    );
    expect(html).toContain('class="x"');
  });
});
