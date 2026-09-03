import { afterEach, describe, expect, it, vi } from "vitest";
import { getCareerMateMcpAllowedOrigins } from "./env";

describe("CareerMate MCP V2 environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses and de-duplicates the Origin allow-list", () => {
    vi.stubEnv(
      "CAREERMATE_MCP_ALLOWED_ORIGINS",
      " https://b.tbox.cn,https://careermate.example,https://b.tbox.cn, ",
    );
    expect(getCareerMateMcpAllowedOrigins()).toEqual([
      "https://b.tbox.cn",
      "https://careermate.example",
    ]);
  });

  it("fails closed with an empty allow-list", () => {
    vi.stubEnv("CAREERMATE_MCP_ALLOWED_ORIGINS", "");
    expect(getCareerMateMcpAllowedOrigins()).toEqual([]);
  });
});
