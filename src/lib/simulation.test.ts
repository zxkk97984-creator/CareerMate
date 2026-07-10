import { describe, expect, it } from "vitest";
import {
  canCompleteSimulation,
  getSimulationScenario,
  nextSimulationPrompt,
  parseSimulationTranscript,
  simulationScenarioKeys,
} from "./simulation";

describe("simulation domain", () => {
  it("defines all three documented scenarios", () => {
    expect(simulationScenarioKeys).toEqual([
      "cross_role_communication",
      "ai_office",
      "remote_collaboration",
    ]);
    for (const key of simulationScenarioKeys) {
      expect(getSimulationScenario(key).openingMessage.length).toBeGreaterThan(10);
    }
  });

  it("allows completion from three through six user turns", () => {
    expect(canCompleteSimulation(2)).toBe(false);
    expect(canCompleteSimulation(3)).toBe(true);
    expect(canCompleteSimulation(6)).toBe(true);
    expect(canCompleteSimulation(7)).toBe(false);
  });

  it("parses stored transcripts safely", () => {
    expect(parseSimulationTranscript("null")).toEqual([]);
    expect(parseSimulationTranscript('{"bad":true}')).toEqual([]);
    expect(parseSimulationTranscript(JSON.stringify([
      { role: "assistant", content: "hello" },
      { role: "system", content: "private" },
      { role: "user", content: "answer" },
    ]))).toEqual([
      { role: "assistant", content: "hello" },
      { role: "user", content: "answer" },
    ]);
  });

  it("provides deterministic turn-specific prompts", () => {
    expect(nextSimulationPrompt("ai_office", 1)).not.toBe(nextSimulationPrompt("ai_office", 2));
  });
});
