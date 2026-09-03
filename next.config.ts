import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 开发环境允许的来源 IP，通过环境变量 DEV_ORIGINS 逗号分隔传入
  // 未设置时使用空数组（仅允许 localhost）
  allowedDevOrigins: process.env.DEV_ORIGINS
    ? process.env.DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
