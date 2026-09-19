import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next.js development origins", () => {
  it("exposes allowed dev origins as an explicit array", () => {
    expect(Array.isArray(nextConfig.allowedDevOrigins)).toBe(true);
  });

  it("always allows the loopback origins used by the launcher scripts", () => {
    // Next.js 16 开发模式会拦截来源与监听主机不一致的请求，被拦截时页面不 hydration：
    // 白屏、按钮无响应。启动脚本默认使用 localhost，但浏览器里常被换成 127.0.0.1，
    // 因此三个回环写法都必须预置放行。
    const origins = nextConfig.allowedDevOrigins as string[];
    expect(origins).toContain("localhost");
    expect(origins).toContain("127.0.0.1");
    expect(origins).toContain("[::1]");
    expect(origins).toContain("127.0.0.1:3000");
  });

  it("serverExternalPackages should include prisma and bcryptjs", () => {
    expect(nextConfig.serverExternalPackages).toContain("@prisma/client");
    expect(nextConfig.serverExternalPackages).toContain("bcryptjs");
  });
});
