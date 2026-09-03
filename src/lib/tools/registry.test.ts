import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createToolRegistry, McpError } from "./registry";

function echoTool() {
  return {
    name: "echo",
    description: "回显工具",
    inputSchema: z.object({ message: z.string() }),
    inputJsonSchema: {
      type: "object",
      required: ["message"],
      properties: { message: { type: "string" } },
    },
    requiredScopes: ["profile:read"],
    handler: async (input: unknown) => input,
  };
}

describe("ToolRegistry", () => {
  it("注册工具后可通过名称查找", () => {
    const registry = createToolRegistry();
    const tool = echoTool();
    registry.register(tool);

    expect(registry.get("echo")).toBe(tool);
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("list 返回所有已注册工具", () => {
    const registry = createToolRegistry();
    registry.register(echoTool());
    registry.register({
      name: "add",
      description: "加法",
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      inputJsonSchema: { type: "object" },
      requiredScopes: [],
      handler: async () => 0,
    });

    expect(registry.list()).toHaveLength(2);
  });

  it("listForMcp 返回 MCP 标准格式", () => {
    const registry = createToolRegistry();
    registry.register(echoTool());

    const mcpList = registry.listForMcp();
    expect(mcpList).toHaveLength(1);
    expect(mcpList[0]).toHaveProperty("name", "echo");
    expect(mcpList[0]).toHaveProperty("description");
    expect(mcpList[0]).toHaveProperty("inputSchema");
  });

  describe("call", () => {
    it("执行注册工具并返回结果", async () => {
      const registry = createToolRegistry();
      registry.register(echoTool());

      const result = await registry.call("echo", { message: "hello" }, {
        userId: "user-1",
        sessionId: "s1",
        scopes: ["profile:read"],
      });

      expect(result).toEqual({ message: "hello" });
    });

    it("未知工具抛出 McpError", async () => {
      const registry = createToolRegistry();

      await expect(
        registry.call("nonexistent", {}, {
          userId: "u1", sessionId: "s1", scopes: [],
        })
      ).rejects.toThrow(McpError);
    });

    it("缺少 scope 抛出 McpError", async () => {
      const registry = createToolRegistry();
      registry.register(echoTool());

      await expect(
        registry.call("echo", { message: "hi" }, {
          userId: "u1", sessionId: "s1", scopes: [],
        })
      ).rejects.toThrow("缺少权限");
    });

    it("输入校验失败抛出 McpError", async () => {
      const registry = createToolRegistry();
      registry.register(echoTool());

      await expect(
        registry.call("echo", { invalid: true }, {
          userId: "u1", sessionId: "s1", scopes: ["profile:read"],
        })
      ).rejects.toThrow("输入参数不合法");
    });
  });
});
