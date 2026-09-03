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

const allowedPluginScopes = new Set([
  "profile:read",
  "profile:candidates",
  "courses:read",
  "jobs:read",
  "progress:write",
]);

export interface PluginPrincipal {
  userId: string;
  scopes: string[];
}

/**
 * 将静态插件 Token 绑定到服务端配置的用户与权限。
 * userId 和 scopes 只从服务端环境读取，绝不接受工具参数覆盖。
 */
export function getPluginPrincipal(request: Request): PluginPrincipal | null {
  if (!isPluginAuthorized(request)) return null;
  const userId = (process.env.CAREERMATE_PLUGIN_USER_ID ?? "").trim();
  if (!userId) return null;
  const scopes = (process.env.CAREERMATE_PLUGIN_SCOPES ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => allowedPluginScopes.has(scope));
  return { userId, scopes: [...new Set(scopes)] };
}

export function requirePluginScope(
  request: Request,
  scope: string,
  requestedUserId?: string,
): PluginPrincipal | null {
  const principal = getPluginPrincipal(request);
  if (!principal || !principal.scopes.includes(scope)) return null;
  if (requestedUserId && requestedUserId !== principal.userId) return null;
  return principal;
}
