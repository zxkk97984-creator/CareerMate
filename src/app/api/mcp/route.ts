import { NextResponse } from "next/server";
import { z } from "zod";
import { McpError } from "@/lib/tools/registry";
import { createCareerMateToolRegistry } from "@/lib/tools/careermate-registry";
import { getPluginPrincipal, isPluginAuthorized } from "@/lib/plugin-auth";

// ── JSON-RPC 请求 schema ─────────────────────────────────

const rpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

// ── 处理器 ──────────────────────────────────────────────

async function handleRequest(request: Request) {
  // 鉴权
  if (!isPluginAuthorized(request)) {
    return jsonRpcError(null, -32001, "认证失败或缺少令牌");
  }

  // 解析 JSON-RPC
  const parsed = rpcRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonRpcError(null, -32600, "无效的 JSON-RPC 请求");
  }

  const { id, method, params } = parsed.data;
  const registry = createCareerMateToolRegistry();

  try {
    switch (method) {
      case "initialize": {
        return jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "CareerMate", version: "0.1.0" },
        });
      }

      case "tools/list": {
        return jsonRpcResult(id, {
          tools: registry.listForMcp(),
        });
      }

      case "tools/call": {
        const callParams = params as { name?: string; arguments?: unknown };
        if (!callParams?.name) {
          return jsonRpcError(id, -32602, "缺少工具名称");
        }

        const principal = getPluginPrincipal(request);
        if (!principal) {
          return jsonRpcError(id, -32003, "插件 Token 尚未绑定用户或权限");
        }

        const ctx = {
          userId: principal.userId,
          sessionId: crypto.randomUUID(),
          scopes: principal.scopes,
        };

        const result = await registry.call(
          callParams.name,
          callParams.arguments ?? {},
          ctx,
        );
        return jsonRpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      }

      default:
        return jsonRpcError(id, -32601, `未知方法: ${method}`);
    }
  } catch (err) {
    if (err instanceof McpError) {
      const mcpCode = err.code === "METHOD_NOT_FOUND" ? -32601
        : err.code === "INVALID_PARAMS" ? -32602
        : err.code === "INSUFFICIENT_SCOPE" ? -32002
        : -32603;
      return jsonRpcError(id, mcpCode, err.message);
    }
    throw err;
  }
}

export async function POST(request: Request) {
  return handleRequest(request);
}

// ── 响应辅助 ─────────────────────────────────────────────

function jsonRpcResult(
  id: string | number | null | undefined,
  result: unknown,
) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  });
}

function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data ? { data } : {}) },
  });
}
