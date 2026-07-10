import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js development origins", () => {
  it("allows the LAN host used to open CareerMate during development", () => {
    expect(nextConfig.allowedDevOrigins).toContain("10.223.47.184");
  });
});
