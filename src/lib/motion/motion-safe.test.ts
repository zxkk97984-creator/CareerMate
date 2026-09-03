import { describe, expect, it } from "vitest";
import { queryMotionSafe } from "./motion-safe";

describe("queryMotionSafe", () => {
  it("allows motion when user has no reduce preference", () => {
    expect(queryMotionSafe({ matches: false })).toBe(true);
  });

  it("blocks motion when reduce is requested", () => {
    expect(queryMotionSafe({ matches: true })).toBe(false);
  });

  it("allows motion when media query is unavailable", () => {
    expect(queryMotionSafe(undefined)).toBe(true);
  });
});
