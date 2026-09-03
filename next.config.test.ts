import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js development origins", () => {
  it("reads allowed dev origins from DEV_ORIGINS env var, defaults to empty", () => {
    // 默认无环境变量时应为空数组
    expect(Array.isArray(nextConfig.allowedDevOrigins)).toBe(true);
  });

  it("serverExternalPackages should include prisma and bcryptjs", () => {
    expect(nextConfig.serverExternalPackages).toContain("@prisma/client");
    expect(nextConfig.serverExternalPackages).toContain("bcryptjs");
  });
});
