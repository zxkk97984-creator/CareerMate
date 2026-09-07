import { expect, it } from "vitest";
import { companionFrames, companionState } from "./companion-sprite";
it("maps actual chat phases to the reference animation states", () => {
  expect(companionState("waiting", "", null)).toBe("thinking");
  expect(companionState("speaking", "", null)).toBe("speaking");
  expect(companionState("idle", "新的问题", null)).toBe("listening");
  expect(companionState("idle", "", "失败")).toBe("confused");
  expect(companionState("idle", "", null)).toBe("idle");
});
it("uses only occupied frames in the 8 by 11 atlas", () => {
  for (const spec of Object.values(companionFrames)) { expect(spec.row).toBeLessThan(11); expect(spec.frames).toBeLessThanOrEqual(8); }
  expect(companionFrames.speaking).toMatchObject({ row: 3, frames: 4 });
  expect(companionFrames.thinking).toMatchObject({ row: 8, frames: 6 });
});
