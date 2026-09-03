import { describe, expect, it, vi } from "vitest";
import { CAREERMATE_V2_TOOL_NAMES, CareerMateV2McpError } from "@/lib/tools/careermate-v2-registry";
import {
  createCareerMateMcpV2Handlers,
  type CareerMateMcpV2Registry,
} from "@/lib/mcp-v2-handler";

const STATIC_TOKEN = "0123456789abcdef".repeat(2);
const ALLOWED_ORIGIN = "https://b.tbox.cn";

function registry(overrides: Partial<CareerMateMcpV2Registry> = {}): CareerMateMcpV2Registry {
  return {
    listForMcp: vi.fn(() => CAREERMATE_V2_TOOL_NAMES.map((name) => ({
      name,
      description: `${name} description`,
      inputSchema: { type: "object" },
    }))),
    call: vi.fn(async () => ({ ok: true, nested: { value: 1 } })),
    ...overrides,
  };
}

function setup(options: {
  registry?: CareerMateMcpV2Registry;
  createRegistry?: () => CareerMateMcpV2Registry;
  token?: string;
  origins?: readonly string[];
  authorize?: (header: string | null, token: string) => boolean;
} = {}) {
  const toolRegistry = options.registry ?? registry();
  const createRegistry = options.createRegistry ?? vi.fn(() => toolRegistry);
  const handlers = createCareerMateMcpV2Handlers({
    createRegistry,
    authorize: options.authorize,
    environment: {
      getPluginToken: () => options.token ?? STATIC_TOKEN,
      getAllowedOrigins: () => options.origins ?? [ALLOWED_ORIGIN],
    },
  });
  return { handlers, toolRegistry, createRegistry };
}

function request(body: string | object, options: {
  authorization?: string;
  accept?: string;
  contentType?: string;
  origin?: string;
  protocolVersion?: string;
} = {}) {
  const headers = new Headers({
    Authorization: options.authorization ?? `Bearer ${STATIC_TOKEN}`,
    Accept: options.accept ?? "application/json, text/event-stream",
    "Content-Type": options.contentType ?? "application/json; charset=utf-8",
  });
  if (options.origin) headers.set("Origin", options.origin);
  if (options.protocolVersion) headers.set("MCP-Protocol-Version", options.protocolVersion);
  return new Request("https://example.test/api/mcp/v2", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function methodRequest(method: "GET" | "DELETE", options: {
  authorization?: string;
  origin?: string;
} = {}) {
  const headers = new Headers({
    Authorization: options.authorization ?? `Bearer ${STATIC_TOKEN}`,
  });
  if (options.origin) headers.set("Origin", options.origin);
  return new Request("https://example.test/api/mcp/v2", { method, headers });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe("CareerMate MCP V2 transport methods", () => {
  it("rejects GET with Allow POST", async () => {
    const { handlers } = setup();
    const response = await handlers.GET(methodRequest("GET"));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects DELETE with Allow POST", async () => {
    const { handlers } = setup();
    const response = await handlers.DELETE(methodRequest("DELETE"));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it.each(["GET", "DELETE"] as const)("rejects a disallowed Origin before %s handling", async (method) => {
    const { handlers } = setup();
    const response = await handlers[method](methodRequest(method, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect((await body(response)).error.message).toBe("Origin not allowed");
  });

  it.each(["GET", "DELETE"] as const)("authenticates %s before method rejection", async (method) => {
    const { handlers } = setup();
    const response = await handlers[method](methodRequest(method, { authorization: "" }));
    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe(-32001);
  });
});

describe("CareerMate MCP V2 transport security", () => {
  it("requires a valid outer Bearer token", async () => {
    const { handlers } = setup();
    for (const authorization of ["", "Basic abc", "Bearer wrong-token"]) {
      const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
        authorization,
      }));
      expect(response.status).toBe(401);
      expect((await body(response)).error.code).toBe(-32001);
    }
  });

  it.each(["", "placeholder", "replace-with-a-real-token", "short-token"])(
    "fails closed for unsafe configured token %j",
    async (token) => {
      const { handlers } = setup({ token });
      const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }));
      expect(response.status).toBe(401);
      expect((await body(response)).error.message).toBe("Authentication failed");
    },
  );

  it("uses the injected static authorizer", async () => {
    const authorize = vi.fn(() => true);
    const { handlers } = setup({ authorize });
    const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
      authorization: ["Bearer", "injected"].join(" "),
    }));
    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(["Bearer", "injected"].join(" "), STATIC_TOKEN);
  });

  it("allows server-to-server requests without Origin", async () => {
    const { handlers } = setup({ origins: [] });
    expect((await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(200);
  });

  it("allows only configured Origins", async () => {
    const { handlers } = setup();
    const allowed = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
      origin: ALLOWED_ORIGIN,
    }));
    const denied = await handlers.POST(request({ jsonrpc: "2.0", id: 2, method: "ping" }, {
      origin: "https://evil.example",
    }));
    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("CareerMate MCP V2 transport negotiation", () => {
  it("requires UTF-8 application/json", async () => {
    const { handlers } = setup();
    for (const contentType of ["text/plain", "application/json; charset=iso-8859-1"]) {
      const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, { contentType }));
      expect(response.status).toBe(415);
    }
  });

  it.each([
    "application/json",
    "text/event-stream",
    "application/json, text/event-stream;q=0",
    "application/json;q=0, text/event-stream",
  ])("requires Accept support for both response media types: %s", async (accept) => {
    const { handlers } = setup();
    const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, { accept }));
    expect(response.status).toBe(406);
  });

  it("parses comma-separated Accept entries and q values", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
      accept: " text/event-stream ; q=0.5 , application/json; charset=utf-8; q=1 ",
    }));
    expect(response.status).toBe(200);
  });

  it("rejects payloads larger than one MiB", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request("x".repeat(1024 * 1024 + 1)));
    expect(response.status).toBe(413);
  });

  it("returns parse error for malformed JSON and invalid UTF-8", async () => {
    const { handlers } = setup();
    const malformed = await handlers.POST(request("{"));
    expect(malformed.status).toBe(200);
    expect((await body(malformed)).error.code).toBe(-32700);

    const invalidUtf8 = new Request("https://example.test/api/mcp/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STATIC_TOKEN}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json; charset=utf-8",
      },
      body: new Uint8Array([0xc3, 0x28]),
    });
    const invalid = await handlers.POST(invalidUtf8);
    expect(invalid.status).toBe(200);
    expect((await body(invalid)).error.code).toBe(-32700);
  });

  it("returns invalid request for batches and malformed JSON-RPC", async () => {
    const { handlers } = setup();
    for (const rpcBody of [
      { jsonrpc: "1.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: {}, method: "ping" },
      { jsonrpc: "2.0", id: null, method: "ping" },
      { jsonrpc: "2.0", id: 1, method: "ping", params: "not-structured" },
      { jsonrpc: "2.0", id: 1, error: { message: "missing numeric code" } },
    ]) {
      const response = await handlers.POST(request(rpcBody));
      expect(response.status).toBe(200);
      expect((await body(response)).error.code).toBe(-32600);
    }
  });

  it("accepts a 2025-03-26 request plus notification batch", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request([
      { jsonrpc: "2.0", id: "ping-1", method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    ], { protocolVersion: "2025-03-26" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual([
      { jsonrpc: "2.0", id: "ping-1", result: {} },
    ]);
  });

  it("returns 202 with an empty body when every batch item is a notification", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request([
      { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } },
    ]));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("returns 202 with an empty body for an all-response batch", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request([
      { jsonrpc: "2.0", id: null, result: {} },
      { jsonrpc: "2.0", id: 2, error: { code: -32603, message: "remote failure" } },
    ]));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it.each([
    { messages: [
        { jsonrpc: "2.0", id: "ping-1", method: "ping" },
        { jsonrpc: "2.0", id: 9, result: { acknowledged: true } },
      ] },
    { messages: [
        { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
        { jsonrpc: "2.0", id: 9, result: { acknowledged: true } },
      ] },
  ])("rejects a response mixed with a request or notification as one invalid batch", async ({ messages }) => {
    const { handlers } = setup();
    const response = await handlers.POST(request(messages, { protocolVersion: "2025-03-26" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid Request" },
    });
  });

  it("rejects an empty batch for 2025-03-26", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request([]));
    expect(response.status).toBe(200);
    expect((await body(response)).error.code).toBe(-32600);
  });

  it("rejects every batch under the 2025-11-25 single-message protocol", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request([
      { jsonrpc: "2.0", id: 1, method: "ping" },
    ], { protocolVersion: "2025-11-25" }));
    expect(response.status).toBe(200);
    expect((await body(response)).error.code).toBe(-32600);
  });

  it.each([99, 100])("accepts a 2025-03-26 batch containing %i requests", async (count) => {
    const { handlers, createRegistry } = setup();
    const response = await handlers.POST(request(
      Array.from({ length: count }, (_, id) => ({ jsonrpc: "2.0", id, method: "ping" })),
      { protocolVersion: "2025-03-26" },
    ));
    expect(response.status).toBe(200);
    const result = await body(response) as unknown as unknown[];
    expect(result).toHaveLength(count);
    expect(createRegistry).toHaveBeenCalledTimes(1);
  });

  it("rejects 101 batch items before classifying messages or creating a registry", async () => {
    const toolRegistry = registry();
    const createRegistry = vi.fn(() => toolRegistry);
    const { handlers } = setup({ registry: toolRegistry, createRegistry });
    const response = await handlers.POST(request(
      Array.from({ length: 101 }, (_, id) => ({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "profile.read", arguments: {} },
      })),
      { protocolVersion: "2025-03-26" },
    ));
    expect(response.status).toBe(200);
    expect((await body(response)).error).toEqual({ code: -32600, message: "Invalid Request" });
    expect(createRegistry).not.toHaveBeenCalled();
    expect(toolRegistry.call).not.toHaveBeenCalled();
  });

  it("accepts supported protocol headers and rejects unsupported values", async () => {
    const { handlers } = setup();
    for (const protocolVersion of ["2025-03-26", "2025-11-25"]) {
      expect((await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, { protocolVersion }))).status).toBe(200);
    }
    const invalid = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }, {
      protocolVersion: "2024-11-05",
    }));
    expect(invalid.status).toBe(400);
  });
});

describe("CareerMate MCP V2 JSON-RPC behavior", () => {
  it("negotiates initialize protocol versions without a session id", async () => {
    const { handlers } = setup();
    const supported = await handlers.POST(request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }));
    const fallback = await handlers.POST(request({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "2099-01-01", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }));
    const supportedBody = await body(supported);
    const fallbackBody = await body(fallback);
    expect(supportedBody.result).toEqual({
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "CareerMate Business MCP V2", version: "2.0.0" },
    });
    expect(fallbackBody.result.protocolVersion).toBe("2025-03-26");
    expect(supported.headers.has("Mcp-Session-Id")).toBe(false);
  });

  it.each([
    undefined,
    {},
    { protocolVersion: "2025-03-26" },
    { protocolVersion: "2025-03-26", capabilities: [] as unknown[], clientInfo: { name: "test", version: "1" } },
    { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
    { protocolVersion: 20250326, capabilities: {}, clientInfo: { name: "test", version: "1" } },
  ])("rejects malformed initialize params with -32602", async (params) => {
    const { handlers } = setup();
    const response = await handlers.POST(request({
      jsonrpc: "2.0", id: 1, method: "initialize", ...(params === undefined ? {} : { params }),
    }));
    expect(response.status).toBe(200);
    expect((await body(response)).error.code).toBe(-32602);
  });

  it("uses 2025-03-26 when a subsequent request omits the protocol header", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(response.status).toBe(200);
    expect((await body(response)).result).toEqual({});
  });

  it("accepts JSON-RPC notifications and responses with 202 and no body", async () => {
    const { handlers } = setup();
    const notification = await handlers.POST(request({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }));
    const rpcResponse = await handlers.POST(request({
      jsonrpc: "2.0",
      id: 7,
      result: {},
    }));
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");
    expect(rpcResponse.status).toBe(202);
    expect(await rpcResponse.text()).toBe("");
  });

  it("lists exactly the seven V2 tools", async () => {
    const { handlers } = setup();
    const response = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    const json = await body(response);
    expect(json.result.tools.map((tool: { name: string }) => tool.name)).toEqual(CAREERMATE_V2_TOOL_NAMES);
  });

  it("calls a tool and returns text plus structured content", async () => {
    const toolRegistry = registry();
    const { handlers } = setup({ registry: toolRegistry });
    const args = { context_token: "opaque" };
    const response = await handlers.POST(request({
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: { name: "profile.read", arguments: args },
    }));
    const json = await body(response);
    expect(toolRegistry.call).toHaveBeenCalledWith("profile.read", args);
    expect(json.result.structuredContent).toEqual({ ok: true, nested: { value: 1 } });
    expect(JSON.parse(json.result.content[0].text)).toEqual(json.result.structuredContent);
  });

  it("wraps array tool results in the structuredContent object", async () => {
    const toolRegistry = registry({ call: vi.fn(async () => ["one", "two"]) });
    const { handlers } = setup({ registry: toolRegistry });
    const response = await handlers.POST(request({
      jsonrpc: "2.0",
      id: "call-array",
      method: "tools/call",
      params: { name: "career_templates.query", arguments: { context_token: "opaque" } },
    }));
    const json = await body(response);
    expect(json.result.structuredContent).toEqual({ result: ["one", "two"] });
    expect(JSON.parse(json.result.content[0].text)).toEqual(["one", "two"]);
  });

  it("returns safe isError CallToolResult for execution failures", async () => {
    const toolRegistry = registry({ call: vi.fn(async () => { throw new Error("database password secret"); }) });
    const { handlers } = setup({ registry: toolRegistry });
    const response = await handlers.POST(request({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "profile.read", arguments: {} },
    }));
    const json = await body(response);
    expect(json.result.isError).toBe(true);
    expect(JSON.parse(json.result.content[0].text)).toEqual({
      code: "INTERNAL_ERROR",
      message: "Internal error",
    });
    expect(JSON.stringify(json)).not.toContain("database password secret");
  });

  it("maps unexpected registry failures without exposing details", async () => {
    const toolRegistry = registry({
      listForMcp: vi.fn(() => { throw new Error("private registry failure"); }),
    });
    const { handlers } = setup({ registry: toolRegistry });
    const response = await handlers.POST(request({
      jsonrpc: "2.0", id: 1, method: "tools/list",
    }));
    const json = await body(response);
    expect(response.status).toBe(200);
    expect(json.error).toEqual({ code: -32603, message: "Internal error" });
    expect(JSON.stringify(json)).not.toContain("private registry failure");
  });
});

describe("CareerMate MCP V2 error mapping", () => {
  it.each([
    ["CONTEXT_TOKEN_INVALID", 401, -32001, "Authentication failed"],
    ["CONTEXT_TOKEN_EXPIRED", 401, -32001, "Authentication failed"],
    ["CONTEXT_SESSION_NOT_FOUND", 403, -32001, "Authentication failed"],
    ["INSUFFICIENT_SCOPE", 403, -32002, "Insufficient scope"],
  ])("maps %s to stable JSON-RPC error %i", async (domainCode, status, rpcCode, message) => {
    const toolRegistry = registry({
      call: vi.fn(async () => {
        throw new CareerMateV2McpError(domainCode, "sensitive implementation detail", status);
      }),
    });
    const { handlers } = setup({ registry: toolRegistry });
    const response = await handlers.POST(request({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "profile.read", arguments: {} },
    }));
    const json = await body(response);
    expect(response.status).toBe(200);
    expect(json.error).toEqual({ code: rpcCode, message });
    expect(JSON.stringify(json)).not.toContain("sensitive implementation detail");
  });

  it.each([
    ["INVALID_PARAMS", 400, "INVALID_PARAMS", "Invalid params"],
    ["CANDIDATE_INVALID_ARTIFACT", 400, "INVALID_PARAMS", "Invalid params"],
    ["PROFILE_NOT_FOUND", 404, "BUSINESS_ERROR", "Business conflict or resource not found"],
    ["SIMULATION_TURN_CONFLICT", 409, "BUSINESS_ERROR", "Business conflict or resource not found"],
    ["INTERNAL_ERROR", 500, "INTERNAL_ERROR", "Internal error"],
    ["UNEXPECTED_DOMAIN_FAILURE", 500, "INTERNAL_ERROR", "Internal error"],
  ])("maps executed tool failure %s to safe isError result", async (domainCode, status, code, message) => {
    const toolRegistry = registry({
      call: vi.fn(async () => {
        throw new CareerMateV2McpError(domainCode, "sensitive implementation detail", status);
      }),
    });
    const { handlers } = setup({ registry: toolRegistry });
    const response = await handlers.POST(request({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "profile.read", arguments: {} },
    }));
    const json = await body(response);
    expect(response.status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.result.isError).toBe(true);
    expect(JSON.parse(json.result.content[0].text)).toEqual({ code, message });
    expect(JSON.stringify(json)).not.toContain("sensitive implementation detail");
  });

  it("returns method-not-found before executing an unknown tool", async () => {
    const toolRegistry = registry();
    const { handlers } = setup({ registry: toolRegistry });
    const response = await handlers.POST(request({
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "unknown.tool", arguments: {} },
    }));
    expect((await body(response)).error).toEqual({ code: -32601, message: "Tool not found" });
    expect(toolRegistry.call).not.toHaveBeenCalled();
  });

  it("uses method-not-found and invalid-params for JSON-RPC dispatch errors", async () => {
    const { handlers } = setup();
    const missing = await handlers.POST(request({ jsonrpc: "2.0", id: 1, method: "unknown" }));
    const invalid = await handlers.POST(request({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { arguments: {} },
    }));
    expect((await body(missing)).error.code).toBe(-32601);
    expect((await body(invalid)).error.code).toBe(-32602);
  });
});
