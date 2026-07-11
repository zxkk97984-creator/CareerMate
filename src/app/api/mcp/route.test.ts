import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPluginAuthorized: vi.fn(),
}));

vi.mock("@/lib/plugin-auth", () => ({
  isPluginAuthorized: mocks.isPluginAuthorized,
}));

const { POST } = await import("./route");

function buildRequest(body: unknown, auth = true): Request {
  mocks.isPluginAuthorized.mockReturnValue(auth);
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("MCP JSON-RPC endpoint", () => {
  it("未认证返回 -32001 错误", async () => {
    const res = await POST(buildRequest({ jsonrpc: "2.0", method: "initialize" }, false));
    const json = await res.json();

    expect(json.jsonrpc).toBe("2.0");
    expect(json.error.code).toBe(-32001);
  });

  it("initialize 返回服务器信息", async () => {
    const res = await POST(buildRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }));
    const json = await res.json();

    expect(json.id).toBe(1);
    expect(json.result.serverInfo.name).toBe("CareerMate");
    expect(json.result.protocolVersion).toBeDefined();
  });

  it("tools/list 返回工具列表", async () => {
    const res = await POST(buildRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    const json = await res.json();

    expect(json.id).toBe(2);
    expect(json.result.tools).toBeDefined();
    expect(Array.isArray(json.result.tools)).toBe(true);
  });

  it("tools/call 缺少工具名称返回 -32602", async () => {
    const res = await POST(buildRequest({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { arguments: {} },
    }));
    const json = await res.json();

    expect(json.error.code).toBe(-32602);
  });

  it("未知方法返回 -32601", async () => {
    const res = await POST(buildRequest({ jsonrpc: "2.0", id: 4, method: "unknown_method" }));
    const json = await res.json();

    expect(json.error.code).toBe(-32601);
  });

  it("无效 JSON-RPC 请求返回 -32600", async () => {
    mocks.isPluginAuthorized.mockReturnValue(true);
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not: "valid" }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.error.code).toBe(-32600);
  });
});
