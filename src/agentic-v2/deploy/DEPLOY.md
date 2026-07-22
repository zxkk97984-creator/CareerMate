# CareerMate 业务 MCP V2 部署指南

## 概述

将 CareerMate MCP V2 Streamable HTTP 端点部署到公网 HTTPS，供百宝箱 Agentic V2 调用。

端点路径：`/api/mcp/v2`
协议：JSON-RPC 2.0 over HTTP POST（Streamable HTTP MCP）

## 前置条件

1. Next.js 16.2+ 生产构建通过
2. 公网 HTTPS 域名（或 Vercel 自动提供的预览 URL）
3. 以下密钥已生成且未提交到 Git

## 第一步：生成密钥

```bash
# 生成 MCP 客户端 Bearer Token（至少 32 字节 base64url）
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 生成 Agentic V2 上下文令牌签名密钥（至少 32 字节 base64url）
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**警告：这些密钥不得提交到 Git、不得打印到日志、不得发送到搜索服务。**

## 第二步：配置环境变量

在部署平台（如 Vercel）设置以下环境变量：

```env
# 数据库（生产环境使用 PostgreSQL 或 Turso）
DATABASE_URL="postgresql://..."

# MCP V2 客户端认证
CAREERMATE_PLUGIN_TOKEN="<第一步生成的 Bearer Token>"

# Agentic V2 上下文令牌签名密钥
CAREERMATE_CONTEXT_TOKEN_SECRET="<第一步生成的签名密钥>"

# Origin 白名单（逗号分隔，不含空格）
CAREERMATE_MCP_ALLOWED_ORIGINS="https://b.tbox.cn,https://o.tbox.cn"

# 开启 Agentic V2 模式
CAREERMATE_AGENTIC_V2="true"
```

## 第三步：部署

### Vercel 部署（推荐）

```bash
npx vercel --prod
```

预览 URL 将自动分配 HTTPS。生产环境绑定自定义域名。

### 自托管部署

```bash
npm run build
npm start
```

前面需配置反向代理（Nginx/Caddy）提供 HTTPS。

## 第四步：验证部署

```bash
# 健康检查 — 应返回 405（GET 不允许，但验证鉴权和 Origin）
curl -v -X GET https://your-deploy.example/api/mcp/v2 \
  -H "Authorization: Bearer <CAREERMATE_PLUGIN_TOKEN>"

# 工具列表 — 应返回 200 + JSON-RPC 响应
curl -v -X POST https://your-deploy.example/api/mcp/v2 \
  -H "Authorization: Bearer <CAREERMATE_PLUGIN_TOKEN>" \
  -H "Origin: https://b.tbox.cn" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

预期响应包含 7 个 V2 工具。

## 第五步：运行验证脚本

```bash
node src/agentic-v2/deploy/verify-deploy.mjs \
  --url "https://your-deploy.example/api/mcp/v2" \
  --token "<CAREERMATE_PLUGIN_TOKEN>" \
  --origin "https://b.tbox.cn"
```

验证包含：
- 工具列表正确性
- 令牌过期拒绝
- 错误 Scope 拒绝
- 跨用户数据隔离
- 非法 Origin 拒绝
- 请求大小限制
- 批量大小限制

## 第六步：百宝箱 MCP 配置

在百宝箱"外包"空间新建 MCP 连接：

1. 名称：`CareerMate业务MCP V2`
2. 类型：Streamable HTTP
3. URL：`https://your-deploy.example/api/mcp/v2`
4. 认证头：`Authorization: Bearer <CAREERMATE_PLUGIN_TOKEN>`
5. 传输协议：`2025-03-26`

## 安全注意事项

- 不在前端代码中引用 `CAREERMATE_PLUGIN_TOKEN`
- Origin 白名单仅包含百宝箱域名
- 定期轮换密钥（建议 90 天）
- 监控 `/api/mcp/v2` 的 401/403 错误率
- 请求大小限制 1MB，批量上限 100
- 令牌中的 `sub` 固定用户身份，不可被请求参数覆盖
