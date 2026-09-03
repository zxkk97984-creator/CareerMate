import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Template from "./template";

describe("Template (SSR)", () => {
  it("renders children without inline opacity styles", () => {
    const html = renderToStaticMarkup(
      <Template>
        <main>内容</main>
      </Template>,
    );
    expect(html).toContain("内容");
    expect(html).not.toContain("opacity:0");
  });
});
