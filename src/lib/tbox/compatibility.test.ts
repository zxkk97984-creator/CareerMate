import { describe, expect, it } from "vitest";
import {
  chatWithTbox,
  createMockChatChunks,
  generatePlanWithTbox,
  retrieveWithTbox,
  streamChatWithTbox,
} from "@/lib/tbox";

describe("legacy tbox module compatibility", () => {
  it("re-exports the focused public adapter surface", () => {
    expect(chatWithTbox).toBeTypeOf("function");
    expect(streamChatWithTbox).toBeTypeOf("function");
    expect(retrieveWithTbox).toBeTypeOf("function");
    expect(generatePlanWithTbox).toBeTypeOf("function");
    expect(createMockChatChunks("hello")).toHaveLength(3);
  });
});
