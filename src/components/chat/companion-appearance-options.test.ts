import { describe, expect, it } from "vitest";
import {
  companionAppearanceOptions,
  companionAvatarUrl,
  companionDisplayName,
} from "./companion-appearance-options";

describe("companion appearance options", () => {
  it("offers all pets, Kurisu and the hidden state", () => {
    expect(companionAppearanceOptions.map((option) => option.id)).toEqual([
      "shuangling",
      "anya",
      "doraemon",
      "kun-like",
      "lulu-capybara",
      "shinchan",
      "kurisu",
      "off",
    ]);
  });

  it("maps every visible identity to its chat name and static avatar", () => {
    expect(companionDisplayName("doraemon")).toBe("哆啦A梦");
    expect(companionAvatarUrl("doraemon")).toContain("doraemon-avatar.png");
    expect(companionDisplayName("kurisu")).toBe("Kurisu");
    expect(companionAvatarUrl("kurisu")).toContain("kurisu-avatar.png");
  });
});
