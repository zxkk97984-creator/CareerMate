import { describe, expect, it } from "vitest";
import { shouldAskQuestion, isValidNormalizedKey } from "./question-ledger";

describe("isValidNormalizedKey", () => {
  it("accepts valid keys", () => {
    expect(isValidNormalizedKey("profile:target_role")).toBe(true);
  });
  it("rejects keys with spaces", () => {
    expect(isValidNormalizedKey("profile:target role")).toBe(false);
  });
  it("rejects short keys", () => {
    expect(isValidNormalizedKey("ab")).toBe(false);
  });
});

describe("shouldAskQuestion", () => {
  it("returns true when no entries exist", () => {
    expect(shouldAskQuestion([], "profile:target_role", 1)).toBe(true);
  });

  it("returns false when already answered at same version", () => {
    expect(shouldAskQuestion(
      [{ normalizedQuestionKey: "profile:target_role", status: "answered", profileVersion: 1 }],
      "profile:target_role", 1,
    )).toBe(false);
  });

  it("returns false when answered at older version", () => {
    expect(shouldAskQuestion(
      [{ normalizedQuestionKey: "profile:target_role", status: "answered", profileVersion: 1 }],
      "profile:target_role", 2,
    )).toBe(false);
  });

  it("returns false when skipped at same version", () => {
    expect(shouldAskQuestion(
      [{ normalizedQuestionKey: "profile:target_role", status: "skipped", profileVersion: 1 }],
      "profile:target_role", 1,
    )).toBe(false);
  });

  it("returns true when skipped but profile version increased", () => {
    expect(shouldAskQuestion(
      [{ normalizedQuestionKey: "profile:target_role", status: "skipped", profileVersion: 1 }],
      "profile:target_role", 2,
    )).toBe(true);
  });

  it("ignores obsolete entries", () => {
    expect(shouldAskQuestion(
      [
        { normalizedQuestionKey: "profile:target_role", status: "obsolete", profileVersion: 1 },
        { normalizedQuestionKey: "profile:target_role", status: "answered", profileVersion: 2 },
      ],
      "profile:target_role", 2,
    )).toBe(false);
  });

  it("returns true when obsolete is the only entry", () => {
    expect(shouldAskQuestion(
      [{ normalizedQuestionKey: "profile:target_role", status: "obsolete", profileVersion: 1 }],
      "profile:target_role", 2,
    )).toBe(true);
  });
});
