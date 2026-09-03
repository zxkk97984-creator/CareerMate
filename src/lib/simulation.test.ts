import { describe, expect, it } from "vitest";
import {
  canCompleteSimulation,
  getSimulationScenario,
  listSimulationScenarios,
  nextSimulationPrompt,
  parseSimulationTranscript,
  simulationScenarioKeys,
} from "./simulation";

describe("simulation domain", () => {
  it("defines five documented scenarios with full metadata", () => {
    expect(simulationScenarioKeys).toEqual([
      "cross_role_communication",
      "ai_office",
      "remote_collaboration",
      "data_driven_decision",
      "requirement_clarification",
    ]);
    const catalog = listSimulationScenarios();
    expect(catalog).toHaveLength(5);
    for (const scenario of catalog) {
      expect(scenario.openingMessage.length).toBeGreaterThan(10);
      expect(scenario.brief.length).toBeGreaterThan(20);
      expect(scenario.objective.length).toBeGreaterThan(10);
      expect(scenario.difficulty).toMatch(/^L[123]$/);
      expect(scenario.durationMinutes).toBeGreaterThan(0);
      expect(scenario.skills.length).toBeGreaterThan(0);
      expect(scenario.scoringDimensions.length).toBeGreaterThanOrEqual(3);
      expect(scenario.prompts.length).toBeGreaterThanOrEqual(5);
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
    expect(nextSimulationPrompt("data_driven_decision", 3)).toContain("?");
  });

  it("returns scenario metadata via getSimulationScenario", () => {
    const scenario = getSimulationScenario("requirement_clarification");
    expect(scenario.key).toBe("requirement_clarification");
    expect(scenario.skills).toContain("communication");
    expect(scenario.scoringDimensions.length).toBeGreaterThanOrEqual(3);
  });
});
