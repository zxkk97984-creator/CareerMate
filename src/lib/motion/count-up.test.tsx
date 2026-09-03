import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CountUp, formatNumber } from "./count-up";

describe("formatNumber", () => {
  it("groups thousands", () => {
    expect(formatNumber(12345)).toBe("12,345");
  });

  it("keeps decimals", () => {
    expect(formatNumber(12345.6, 1)).toBe("12,345.6");
  });

  it("skips separator when asked", () => {
    expect(formatNumber(12345.6, 1, false)).toBe("12345.6");
  });
});

describe("CountUp (SSR)", () => {
  it("renders the final value server-side", () => {
    const html = renderToStaticMarkup(<CountUp value={82} />);
    expect(html).toContain("82");
  });
});
