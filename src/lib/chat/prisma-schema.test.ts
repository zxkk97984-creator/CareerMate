import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("chat-first prisma schema", () => {
  it("exposes persistent conversations, messages, evidence and exploration reports", () => {
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

    for (const model of ["ChatConversation", "ChatMessage", "AbilityEvidence", "CareerExplorationReport"]) {
      expect(schema).toContain(`model ${model} {`);
    }
    for (const field of ["conversationId", "role", "content", "parts", "status"]) {
      expect(schema).toMatch(new RegExp(`model ChatMessage \\{[\\s\\S]*?\\n\\s+${field}\\s`));
    }
    for (const field of ["sourceConversationId", "evidenceExcerpt", "impactSummary", "abilityEvidenceId"]) {
      expect(schema).toMatch(new RegExp(`model ProfileUpdateCandidate \\{[\\s\\S]*?\\n\\s+${field}\\s`));
    }
  });
});
