import { z } from "zod";

// ── 类型 ──────────────────────────────────────────────────

export interface ToolContext {
  userId: string;
  sessionId: string;
  scopes: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  inputJsonSchema: Record<string, unknown>;
  requiredScopes: string[];
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

// ── 注册表 ──────────────────────────────────────────────

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  /** JSON-RPC tools/list 格式 */
  listForMcp(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  /** 执行工具，校验 scope */
  call(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown>;
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();

  return {
    register(tool) {
      tools.set(tool.name, tool);
    },

    get(name) {
      return tools.get(name);
    },

    list() {
      return Array.from(tools.values());
    },

    listForMcp() {
      return Array.from(tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputJsonSchema,
      }));
    },

    async call(name, input, ctx) {
      const tool = tools.get(name);
      if (!tool) {
        throw new McpError("METHOD_NOT_FOUND", `未知工具: ${name}`);
      }

      // Scope 校验
      const missingScopes = tool.requiredScopes.filter(
        (s) => !ctx.scopes.includes(s),
      );
      if (missingScopes.length > 0) {
        throw new McpError(
          "INSUFFICIENT_SCOPE",
          `缺少权限: ${missingScopes.join(", ")}`,
        );
      }

      // 输入校验
      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new McpError("INVALID_PARAMS", "输入参数不合法", parsed.error);
      }

      // 执行
      return tool.handler(parsed.data, ctx);
    },
  };
}

// ── 错误 ────────────────────────────────────────────────

export class McpError extends Error {
  constructor(
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "McpError";
  }
}
