# CareerMate 部署指南

## 概述

将 CareerMate Next.js 应用部署到公网 HTTPS，供百宝箱 Agentic V2 通过 HTTP API 调用。

端点路径：`/api/agentic-v2`、`/api/chat/conversations/:id/stream`
协议：REST + SSE（Server-Sent Events）

## 数据库说明

当前 Prisma provider 为 **SQLite**，适用于本地开发或单实例持久卷演示场景。

SQLite = 本地或单实例持久卷演示。不要声称只改 `DATABASE_URL` 就能部署 PostgreSQL/Turso/Vercel。

如需生产环境多实例部署，需先完成正式的 PostgreSQL 迁移（修改 schema 中的 provider 并重新生成迁移），本文档不涉及半套数据库迁移。

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
# 数据库（当前为 SQLite，仅支持单实例持久卷）
DATABASE_URL="file:./data/production.db"

# 应用内认证密钥
CAREERMATE_AUTH_SECRET="<生成的随机密钥>"

# 开启 Agentic V2 模式
CAREERMATE_AGENTIC_V2="true"

# 管理员凭据（生产环境必填，从显式环境变量读取）
CAREERMATE_ADMIN_USERNAME=""
CAREERMATE_ADMIN_PASSWORD_HASH=""
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
# 健康检查 — 应返回 200
curl -v -X GET https://your-deploy.example/

# Agentic V2 候选列表 — 应返回 200 + JSON
curl -v -X GET https://your-deploy.example/api/agentic-v2/candidates?status=pending \
  -H "Cookie: session=<your-session-token>"
```

## 第五步：百宝箱配置

在百宝箱"外包"空间配置 Agentic V2 连接：

1. 名称：`CareerMate Agentic V2`
2. 协议：REST + SSE
3. Chat 端点：`https://your-deploy.example/api/chat/conversations/:id/stream`
4. 上下文通过 `business_data` 一次性注入，不需要独立业务 MCP

## 安全注意事项

- 不在前端代码中引用认证密钥
- 定期轮换密钥（建议 90 天）
- 生产环境必须通过 `CAREERMATE_ADMIN_USERNAME` / `CAREERMATE_ADMIN_PASSWORD_HASH` 显式设置管理员凭据，种子脚本不得自动创建固定密码管理员
- 开发机 IP 等敏感配置通过环境变量传入，不在 next.config.ts 中硬编码
