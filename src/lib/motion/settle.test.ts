import { describe, expect, it } from "vitest";
import { playExitFade, playSettle } from "./settle";

describe("settle helpers", () => {
  it("completes immediately when no element (safe no-op)", () => {
    let done = false;
    playSettle(null, () => {
      done = true;
    });
    expect(done).toBe(true);
  });

  it("playExitFade completes immediately when no element", () => {
    let done = false;
    playExitFade(null, () => {
      done = true;
    });
    expect(done).toBe(true);
  });
});
