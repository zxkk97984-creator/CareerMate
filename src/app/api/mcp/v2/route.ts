import "server-only";
import { timingSafeEqual } from "node:crypto";
import {
  getCareerMateMcpAllowedOrigins,
  getPluginToken,
} from "@/lib/env";
import {
  CareerMateV2McpError,
  createCareerMateV2ToolRegistry,
} from "@/lib/tools/careermate-v2-registry";

const JSON_RPC_VERSION = "2.0" as const;
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([DEFAULT_PROTOCOL_VERSION, "2025-11-25"]);
const MAX_REQUEST_BYTES = 1024 * 1024;
const RESPONSE_MEDIA_TYPES = ["application/json", "text/event-stream"] as const;

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

export interface CareerMateMcpV2Registry {
  listForMcp(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  call(name: string, input: unknown): Promise<unknown>;
}

export interface CareerMateMcpV2Environment {
  getPluginToken(): string;
  getAllowedOrigins(): readonly string[];
}

export interface CareerMateMcpV2HandlerDependencies {
  createRegistry?: () => CareerMateMcpV2Registry;
  authorize?: (authorizationHeader: string | null, configuredToken: string) => boolean;
  environment?: CareerMateMcpV2Environment;
}

interface JsonRpcRequest {
  jsonrpc: typeof JSON_RPC_VERSION;
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

const SECURE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  Vary: "Accept, Authorization, Origin",
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...SECURE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function emptyResponse(status: number, headers: HeadersInit = {}): Response {
  return new Response(null, { status, headers: { ...SECURE_HEADERS, ...headers } });
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: JSON_RPC_VERSION, id, result });
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  status = 200,
): Response {
  return jsonResponse({
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: { code, message },
  }, status);
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || (
    typeof value === "number" && Number.isFinite(value)
  );
}

function classifyMessage(value: unknown):
  | { kind: "request"; value: JsonRpcRequest }
  | { kind: "notification" }
  | { kind: "response" }
  | { kind: "invalid" } {
  if (!isRecord(value) || value.jsonrpc !== JSON_RPC_VERSION) return { kind: "invalid" };

  if ("method" in value) {
    if (typeof value.method !== "string" || !value.method) return { kind: "invalid" };
    if ("id" in value && !isJsonRpcId(value.id)) return { kind: "invalid" };
    if (
      value.params !== undefined
      && !isRecord(value.params)
      && !Array.isArray(value.params)
    ) return { kind: "invalid" };
    if (!("id" in value)) return { kind: "notification" };
    return {
      kind: "request",
      value: {
        jsonrpc: JSON_RPC_VERSION,
        id: value.id as JsonRpcId,
        method: value.method,
        ...(value.params === undefined ? {} : { params: value.params }),
      },
    };
  }

  if (!("id" in value) || !isJsonRpcId(value.id)) return { kind: "invalid" };
  const hasResult = "result" in value;
  const hasError = "error" in value;
  if (hasResult === hasError) return { kind: "invalid" };
  if (hasError && (
    !isRecord(value.error)
    || typeof value.error.code !== "number"
    || !Number.isFinite(value.error.code)
    || typeof value.error.message !== "string"
  )) return { kind: "invalid" };
  return { kind: "response" };
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function isUnsafeConfiguredToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return byteLength(value) < 32 || /placeholder|replace[-_ ]?with|change[-_ ]?me|example/.test(normalized);
}

export function verifyCareerMateMcpV2Bearer(
  authorizationHeader: string | null,
  configuredToken: string,
): boolean {
  if (isUnsafeConfiguredToken(configuredToken)) return false;
  const match = authorizationHeader?.match(/^Bearer ([^\s]+)$/i);
  if (!match) return false;
  const provided = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(configuredToken, "utf8");
  if (provided.byteLength !== expected.byteLength) return false;
  return timingSafeEqual(provided, expected);
}

function isAllowedOrigin(origin: string | null, allowedOrigins: readonly string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function mediaTypeQuality(entry: string): { mediaType: string; quality: number } | null {
  const [rawMediaType, ...parameters] = entry.split(";");
  const mediaType = rawMediaType.trim().toLowerCase();
  if (!mediaType) return null;
  let quality = 1;
  for (const parameter of parameters) {
    const [rawName, rawValue] = parameter.split("=");
    if (rawName?.trim().toLowerCase() !== "q") continue;
    const parsed = Number(rawValue?.trim());
    quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
  }
  return { mediaType, quality };
}

function acceptsRequiredMediaTypes(header: string | null): boolean {
  if (!header) return false;
  const accepted = header
    .split(",")
    .map(mediaTypeQuality)
    .filter((entry): entry is { mediaType: string; quality: number } => entry !== null);
  return RESPONSE_MEDIA_TYPES.every((required) => (
    accepted.some(({ mediaType, quality }) => mediaType === required && quality > 0)
  ));
}

function acceptsUtf8Json(contentType: string | null): boolean {
  if (!contentType) return false;
  const [rawMediaType, ...parameters] = contentType.split(";");
  if (rawMediaType.trim().toLowerCase() !== "application/json") return false;
  for (const parameter of parameters) {
    const [rawName, rawValue] = parameter.split("=");
    if (rawName?.trim().toLowerCase() !== "charset") continue;
    const charset = rawValue?.trim().replace(/^"|"$/g, "").toLowerCase();
    if (charset !== "utf-8" && charset !== "utf8") return false;
  }
  return true;
}

function hasSupportedProtocolHeader(request: Request): boolean {
  const version = request.headers.get("MCP-Protocol-Version");
  return !version || SUPPORTED_PROTOCOL_VERSIONS.has(version.trim());
}

async function readJsonBody(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; kind: "too_large" | "parse_error" }
> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
      return { ok: false, kind: "too_large" };
    }
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return { ok: false, kind: "too_large" };
      }
      chunks.push(chunk.value);
    }
  }
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, kind: "parse_error" };
  }
}

function negotiatedProtocolVersion(params: unknown): string | null {
  if (!isRecord(params) || typeof params.protocolVersion !== "string") return null;
  return SUPPORTED_PROTOCOL_VERSIONS.has(params.protocolVersion)
    ? params.protocolVersion
    : DEFAULT_PROTOCOL_VERSION;
}

function mapDomainError(error: unknown): { code: number; message: string } {
  if (!(error instanceof CareerMateV2McpError)) {
    return { code: -32603, message: "Internal error" };
  }
  switch (error.code) {
    case "INVALID_PARAMS":
      return { code: -32602, message: "Invalid params" };
    case "TOOL_NOT_FOUND":
      return { code: -32601, message: "Tool not found" };
    case "CONTEXT_TOKEN_INVALID":
    case "CONTEXT_TOKEN_EXPIRED":
    case "CONTEXT_SESSION_NOT_FOUND":
      return { code: -32001, message: "Authentication failed" };
    case "INSUFFICIENT_SCOPE":
      return { code: -32002, message: "Insufficient scope" };
    case "INTERNAL_ERROR":
      return { code: -32603, message: "Internal error" };
    default:
      if (error.status === 400) return { code: -32602, message: "Invalid params" };
      if (error.status === 401 || error.status === 403) {
        return { code: -32001, message: "Authentication failed" };
      }
      if (error.status === 404 || error.status === 409) {
        return { code: -32003, message: "Business conflict or resource not found" };
      }
      return { code: -32603, message: "Internal error" };
  }
}

function structuredContentFor(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { result: value };
}

async function dispatchRequest(
  request: JsonRpcRequest,
  registry: CareerMateMcpV2Registry,
): Promise<Response> {
  const id = request.id ?? null;
  switch (request.method) {
    case "initialize": {
      const version = negotiatedProtocolVersion(request.params);
      if (!version) return rpcError(id, -32602, "Invalid params");
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: {} },
        serverInfo: { name: "CareerMate Business MCP V2", version: "2.0.0" },
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: registry.listForMcp() });
    case "tools/call": {
      if (!isRecord(request.params) || typeof request.params.name !== "string" || !request.params.name) {
        return rpcError(id, -32602, "Invalid params");
      }
      try {
        const toolResult = await registry.call(
          request.params.name,
          request.params.arguments ?? {},
        );
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(toolResult) }],
          structuredContent: structuredContentFor(toolResult),
        });
      } catch (error) {
        const mapped = mapDomainError(error);
        return rpcError(id, mapped.code, mapped.message);
      }
    }
    default:
      return rpcError(id, -32601, "Method not found");
  }
}

export function createCareerMateMcpV2Handlers(
  dependencies: CareerMateMcpV2HandlerDependencies = {},
) {
  const createRegistry = dependencies.createRegistry ?? createCareerMateV2ToolRegistry;
  const authorize = dependencies.authorize ?? verifyCareerMateMcpV2Bearer;
  const environment = dependencies.environment ?? {
    getPluginToken,
    getAllowedOrigins: getCareerMateMcpAllowedOrigins,
  };

  return {
    async POST(request: Request): Promise<Response> {
      if (!isAllowedOrigin(request.headers.get("Origin"), environment.getAllowedOrigins())) {
        return rpcError(null, -32001, "Origin not allowed", 403);
      }
      if (!authorize(request.headers.get("Authorization"), environment.getPluginToken())) {
        return rpcError(null, -32001, "Authentication failed", 401);
      }
      if (!hasSupportedProtocolHeader(request)) {
        return rpcError(null, -32600, "Unsupported MCP protocol version", 400);
      }
      if (!acceptsUtf8Json(request.headers.get("Content-Type"))) {
        return rpcError(null, -32600, "Content-Type must be UTF-8 application/json", 415);
      }
      if (!acceptsRequiredMediaTypes(request.headers.get("Accept"))) {
        return rpcError(null, -32600, "Accept must support application/json and text/event-stream", 406);
      }

      const parsedBody = await readJsonBody(request);
      if (!parsedBody.ok) {
        if (parsedBody.kind === "too_large") {
          return rpcError(null, -32600, "Request body too large", 413);
        }
        return rpcError(null, -32700, "Parse error");
      }

      const classified = classifyMessage(parsedBody.value);
      if (classified.kind === "invalid") return rpcError(null, -32600, "Invalid Request");
      if (classified.kind === "notification" || classified.kind === "response") {
        return emptyResponse(202);
      }
      try {
        return await dispatchRequest(classified.value, createRegistry());
      } catch (error) {
        const mapped = mapDomainError(error);
        return rpcError(classified.value.id ?? null, mapped.code, mapped.message);
      }
    },

    async GET(): Promise<Response> {
      return emptyResponse(405, { Allow: "POST" });
    },

    async DELETE(): Promise<Response> {
      return emptyResponse(405, { Allow: "POST" });
    },
  };
}

const handlers = createCareerMateMcpV2Handlers();

export const POST = handlers.POST;
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
