import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.223.47.184"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
