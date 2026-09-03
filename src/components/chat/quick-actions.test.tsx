import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuickActions } from "./quick-actions";

describe("QuickActions (SSR)", () => {
  it("renders all action buttons visible", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        questionId="q1"
        actions={[
          { id: "a1", label: "查看建议", value: "v1" },
          { id: "a2", label: "继续追问", value: "v2" },
        ]}
        status="pending"
        onSelect={vi.fn()}
      />,
    );
    expect(html).toContain("查看建议");
    expect(html).toContain("继续追问");
    expect(html).not.toContain("opacity:0");
  });

  it("renders nothing when obsolete", () => {
    const html = renderToStaticMarkup(
      <QuickActions
        questionId="q1"
        actions={[{ id: "a1", label: "查看建议", value: "v1" }]}
        status="obsolete"
        onSelect={vi.fn()}
      />,
    );
    expect(html).toBe("");
  });
});
