import type { NextConfig } from "next";

/**
 * Next.js 16 开发模式会拦截“来源并非监听主机”的请求（含 HMR WebSocket 与 RSC 请求）。
 * 被拦截时页面 HTML 能正常返回、但 React 永远不会 hydration：
 * 表现为白屏、按钮点了没反应、`<form>` 退化成原生提交后 URL 变成 `/login?`。
 *
 * 开发机常见的三种访问方式（localhost / 127.0.0.1 / ::1）默认互不相同，因此这里
 * 预先放行本机回环地址；另外可用 DEV_ORIGINS 逗号分隔追加局域网地址，例如
 *   DEV_ORIGINS="192.168.1.10,192.168.1.10:3000"
 *
 * 注意：放行来源只影响开发服务器的资源请求，不改变生产行为。
 */
const loopbackOrigins = ["localhost", "localhost:3000", "127.0.0.1", "127.0.0.1:3000", "[::1]", "[::1]:3000"];

function readDevOrigins(): string[] {
  const configured = (process.env.DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([...loopbackOrigins, ...configured])];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: readDevOrigins(),
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
