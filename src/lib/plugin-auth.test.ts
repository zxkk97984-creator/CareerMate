import { afterEach, describe, expect, it, vi } from "vitest";
import { getPluginPrincipal, isPluginAuthorized } from "./plugin-auth";

function pluginRequest(authorization?: string) {
  return new Request("http://localhost/api/mcp/profile/read", {
    headers: authorization ? { authorization } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("plugin authorization", () => {
  it("denies by default when no plugin token is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAREERMATE_PLUGIN_TOKEN", "");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_PLUGIN", "");

    expect(isPluginAuthorized(pluginRequest())).toBe(false);
  });

  it("allows an explicit unauthenticated development override", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAREERMATE_PLUGIN_TOKEN", "");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_PLUGIN", "true");

    expect(isPluginAuthorized(pluginRequest())).toBe(true);
  });

  it("ignores the unauthenticated override in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAREERMATE_PLUGIN_TOKEN", "");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_PLUGIN", "true");

    expect(isPluginAuthorized(pluginRequest())).toBe(false);
  });

  it("requires the exact Bearer token when one is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAREERMATE_PLUGIN_TOKEN", "local-plugin-secret");
    vi.stubEnv("ALLOW_UNAUTHENTICATED_PLUGIN", "true");

    expect(isPluginAuthorized(pluginRequest("Bearer local-plugin-secret"))).toBe(true);
    // Bearer 前缀大小写不敏感（RFC 7235），但 Token 必须精确匹配
    expect(isPluginAuthorized(pluginRequest("bearer local-plugin-secret"))).toBe(true);
    expect(isPluginAuthorized(pluginRequest("Bearer local-plugin-secret extra"))).toBe(false);
    expect(isPluginAuthorized(pluginRequest("Bearer wrong"))).toBe(false);
    expect(isPluginAuthorized(pluginRequest())).toBe(false);
  });

  it("binds an authenticated plugin token to a configured user and scopes", () => {
    vi.stubEnv("CAREERMATE_PLUGIN_TOKEN", "local-plugin-secret");
    vi.stubEnv("CAREERMATE_PLUGIN_USER_ID", "user-1");
    vi.stubEnv("CAREERMATE_PLUGIN_SCOPES", "profile:read,jobs:read");

    expect(
      getPluginPrincipal(pluginRequest("Bearer local-plugin-secret")),
    ).toEqual({ userId: "user-1", scopes: ["profile:read", "jobs:read"] });
  });

  it("does not invent a user binding when the configured user is missing", () => {
    vi.stubEnv("CAREERMATE_PLUGIN_TOKEN", "local-plugin-secret");
    vi.stubEnv("CAREERMATE_PLUGIN_USER_ID", "");
    vi.stubEnv("CAREERMATE_PLUGIN_SCOPES", "profile:read");

    expect(
      getPluginPrincipal(pluginRequest("Bearer local-plugin-secret")),
    ).toBeNull();
  });
});
