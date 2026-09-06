# CareerMate 部署说明

本文只记录当前仓库代码支持的部署边界。部署前请以 `package.json`、`next.config.ts`、`.env.example` 和 `prisma/schema.prisma` 为准。

## 1. 当前部署形态

CareerMate 是 Next.js 16 App Router 应用，当前 Prisma provider 是 SQLite：

- 适合本地开发、单实例自托管或带持久卷的演示环境。
- 不应仅修改 `DATABASE_URL` 就声称支持 PostgreSQL、Turso 或多实例 Vercel 部署。
- 多实例生产环境需要单独完成 Prisma provider、迁移、锁和持久化策略迁移。

应用端口由启动命令决定：

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

反向代理或平台需要提供 HTTPS。当前产品聊天使用 SSE，因此代理必须允许长连接和 `text/event-stream` 响应。

## 2. 必要环境变量

最小本地配置：

```env
DATABASE_URL="file:./dev.db"
TBOX_MODE="mock"
```

真实百宝箱 Agentic V2 环境：

```env
DATABASE_URL="file:./data/production.db"
TBOX_MODE="api"
TBOX_API_KEY="<server-only-api-key>"
TBOX_AGENT_ID="<validated-agent-id>"
TBOX_AGENT_VERSION="<validated-agent-version>"
CAREERMATE_AGENTIC_V2="true"
TBOX_CONTEXT_TRANSPORT="business_data"
TBOX_HISTORY_MODE="provider"
STATEFUL_CHAT_TURNS="true"
TBOX_SEARCH_ENGINE="false"
```

可选开关：

- `PLAN_V2_WRITE=true`：允许写入 V2 灵活计划。
- `TBOX_STRUCTURED_MODE=terminal`：启用旧 AgentResponse terminal 路径；只有完成探针验证后才应开启。
- `AGENT_OPERATIONS_V1=true`：启用旧 structured operations；默认关闭。

不要配置或依赖不存在于当前代码中的 `CAREERMATE_AUTH_SECRET`、`CAREERMATE_ADMIN_USERNAME` 或 `CAREERMATE_ADMIN_PASSWORD_HASH`。

## 3. 认证和管理员

当前认证实现是数据库 session：

```text
登录
→ 随机 session token
→ 数据库保存 token hash
→ httpOnly Cookie careermate_session
```

管理员权限来自 `User.role === "admin"`，不是独立的管理员环境变量。管理员用户应通过受控的数据库初始化或后台流程创建，不能在公开部署中依赖固定演示密码。

相关代码：

- `src/lib/auth.ts`
- `src/lib/session-security.ts`
- `src/app/api/auth/*`

## 4. 数据库初始化

首次部署：

```bash
npm install
npm run prisma:generate
npm run db:migrate:deploy
```

仅在本地开发或专用测试环境使用：

```bash
npm run seed
```

`prisma/seed.ts` 写入虚构用户、岗位模板和资源；生产环境不要直接使用演示种子覆盖数据库。

## 5. 主要公网行为

浏览器页面：

```text
/
/login
/onboarding
/dashboard
/path
/simulation
/resources
/memory
/admin
```

产品聊天：

```text
POST /api/chat/conversations/:id/stream
```

该接口要求当前 CareerMate session Cookie，不是供百宝箱直接用无状态 Bearer Token 调用的公网 Chat API。

Agentic V2 的业务上下文由 CareerMate 服务端在请求内部组装为 `business_data`。当前 V2 聊天不依赖公网业务 MCP，也不依赖签名上下文令牌。

候选接口：

```text
GET  /api/agentic-v2/candidates
GET  /api/agentic-v2/candidates/:candidateId
POST /api/agentic-v2/candidates/:candidateId/decision
```

## 6. 部署后验证

先检查页面：

```bash
curl -I https://your-domain.example/
curl -I https://your-domain.example/login
```

再用已登录浏览器验证：

1. 登录并进入 `/dashboard`。
2. 确认工作台可以加载 `/api/me`。
3. 打开 Kurisu 浮窗并创建会话。
4. 发送消息，确认 SSE 返回 `context`、`delta` 和 `done`。
5. 验证候选只能在用户确认后写入正式数据。
6. 验证 `/memory` 的导出和清空确认词流程。

本地质量门禁：

```bash
npm run secret:scan
npm run lint
npm run typecheck
npm run test
npm run test:migrations
npm run build
```

## 7. 安全边界

- `TBOX_API_KEY`、`TBOX_AGENT_ID` 和上下文密钥只能存在于服务端环境变量。
- 不要把真实密钥、session Cookie 或 SQLite 数据库提交到 Git。
- 生产环境使用持久化数据库路径，并限制数据库文件访问权限。
- 反向代理必须正确转发 Cookie、SSE 和长连接。
- `CAREERMATE_CONTEXT_TOKEN_SECRET`、`CAREERMATE_PLUGIN_TOKEN` 和 `/api/mcp/v2` 属于保留基础设施；启用它们前必须单独完成 Scope、Origin、协议和跨用户隔离验证。
