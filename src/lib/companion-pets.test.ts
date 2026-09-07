import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPANION_PETS, getCompanionPet } from "./companion-pets";

describe("companion pets registry", () => {
  it("includes every K12 companion", () => {
    expect(COMPANION_PETS.map((pet) => pet.id)).toEqual([
      "shuangling",
      "anya",
      "doraemon",
      "kun-like",
      "lulu-capybara",
      "shinchan",
    ]);
  });

  it("references existing spritesheet and static avatar assets", () => {
    for (const pet of COMPANION_PETS) {
      const sprite = path.join(process.cwd(), "public", pet.spriteUrl);
      const avatar = path.join(process.cwd(), "public", pet.avatarUrl);
      expect(existsSync(sprite), `${pet.id} spritesheet`).toBe(true);
      expect(existsSync(avatar), `${pet.id} avatar`).toBe(true);
    }
  });

  it("falls back to Shuangling for unknown ids", () => {
    expect(getCompanionPet("not-a-pet").id).toBe("shuangling");
  });
});
