import { getPluginToken } from "@/lib/env";

/** 从请求头提取 Bearer Token */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function isPluginAuthorized(request: Request) {
  const configured = getPluginToken();
  if (!configured) {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_UNAUTHENTICATED_PLUGIN === "true"
    );
  }

  const token = extractBearerToken(request);
  return token === configured;
}
