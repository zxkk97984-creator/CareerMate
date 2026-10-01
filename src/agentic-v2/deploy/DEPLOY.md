# CareerMate 部署说明

校准日期：2026-10-01。本文按当前仓库源码描述部署和验证方式；未连接平台控制台核验当前 Agent、工作流挂载或发布版本。配置依据是 [package.json](../../../package.json)、[next.config.ts](../../../next.config.ts)、[.env.example](../../../.env.example) 和 [Prisma schema](../../../prisma/schema.prisma)。

## 1. 当前部署形态

CareerMate 是 Next.js 16 App Router 全栈应用，页面和 Route Handler 在同一个进程中运行，Prisma provider 为 SQLite。项目要求 Node.js 22 或 24。

- 支持本地开发、单实例自托管或带持久卷的演示环境。
- SQLite 文件必须可持久化；当前头像作为 `User.avatarDataUrl` 存在数据库中，没有独立上传目录。不能只改 `DATABASE_URL` 就宣称支持 PostgreSQL、Turso 或无持久磁盘的多实例部署。
- 多实例部署需要另行迁移数据库 provider、迁移文件、锁与持久化策略。

生产构建和监听端口由启动命令决定，例如：

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

公网部署应由反向代理提供 HTTPS。生产 session Cookie 设置 `secure=true`；代理还需允许 SSE 长连接，避免将 `text/event-stream` 缓冲成完整响应。

比赛评委在本机使用时，优先按 [评委启动说明](../../../scripts/submission/README.md) 执行 `start.sh`、`start.command` 或 `start.bat`。这些启动器使用独立 `prisma/review.db`、只监听 `127.0.0.1`，并初始化演示账户，属于评审演示流程；不是公网生产的管理员初始化方案。

## 2. 环境配置与真实 API

从 `.env.example` 复制本地 `.env`，模板默认 `TBOX_MODE=mock`、`CAREERMATE_AGENTIC_V2=false`，无需真实 API 凭据即可运行演示。`DATABASE_URL="file:./dev.db"` 是相对 Prisma schema 的开发库路径。

真实百宝箱 V2 的示例配置：

```env
DATABASE_URL="file:/srv/careermate/production.db"
TBOX_MODE="api"
TBOX_API_KEY="<server-only-api-key>"
TBOX_AGENT_ID="<published-agent-id>"
TBOX_AGENT_VERSION="<validated-agent-version>"
CAREERMATE_AGENTIC_V2="true"
TBOX_CONTEXT_TRANSPORT="question_prefix"
TBOX_HISTORY_MODE="context_only"
STATEFUL_CHAT_TURNS="true"
TBOX_SEARCH_ENGINE="false"
NEXT_PUBLIC_APP_URL="https://your-domain.example"
```

`production.db` 的绝对路径是部署者选择的持久化位置，父目录需提前创建并赋予应用进程权限。`TBOX_AGENT_VERSION` 默认为空，代码没有写死平台发布版本；示例版本应换成实际验证过的值。客户端实际发送 `agent_id`，不发送 `app_id`，所以 `TBOX_APP_ID` 不是聊天请求的必需参数。

V2 默认将脱敏快照放进模型可见的问题前缀；普通 V2 主聊天遇到非 `question_prefix` 的有效配置值时，会将结构化 context 交给客户端发送为 `business_data` JSON 字符串字段。它不发送 `history`，会复用与当前 Agent ID/版本匹配的远端会话绑定，并以每轮 `searchPolicy=off` 关闭内置搜索。知识库与研究员的实际调用仍取决于平台绑定，见 [绑定说明](../platform/BINDINGS.md)。

`TBOX_HISTORY_MODE` 目前仅被配置读取器保留，没有实际运行分支消费；有状态旧聊天是否发送历史由 `TBOX_CONTEXT_TRANSPORT=provider_history` 决定，普通 V2 对该值仍按结构化 context 处理。

保留开关的实际范围：

| 配置 | 当前作用与默认值 |
|---|---|
| `STATEFUL_CHAT_TURNS` | 默认 true，启用轮次幂等、锁和分阶段事务 |
| `TBOX_REUSE_REMOTE_CONVERSATION_ID` | 默认 false，控制旧聊天的远端会话复用；V2 有独立的匹配绑定逻辑 |
| `TBOX_STRUCTURED_MODE` | 默认 disabled；terminal 属于旧 AgentResponse 协议，不是 V2 Artifact 文本信封开关 |
| `AGENT_OPERATIONS_V1` | 默认 false，控制旧 structured operations；V2 候选确认使用另一套处理链路 |
| `PLAN_V2_WRITE` | 默认 false，限制旧聊天 operations 的 `plan_draft` 写入；不是所有 V2 候选的总开关 |
| `CONVERSATION_SUMMARY` | 默认 false，控制版本化会话摘要 |

旧 structured 路径依赖上游实际返回对应字段，不能通过开启开关就宣称真实 API 已支持。`OPEN_CHAT_ENTRY` 虽仍有定义，目前没有运行时调用；把它设为 false 不会恢复旧首页或旧引导。也没有 `CAREERMATE_AUTH_SECRET`、`CAREERMATE_ADMIN_USERNAME` 或 `CAREERMATE_ADMIN_PASSWORD_HASH` 的可用认证初始化逻辑。

## 3. 认证和管理员

[auth.ts](../../lib/auth.ts) 使用数据库 session：登录生成随机 token，数据库只存 SHA-256 token hash，浏览器持有 `httpOnly`、`sameSite=lax` 的 `careermate_session` Cookie。有效期为 7 天，生产环境 Cookie 还设置 `secure=true`。

管理员鉴权读取 `User.role === "admin"`。注册接口创建普通用户；仓库没有可通过管理员环境变量自动创建生产管理员的启动过程。生产管理员应通过受控的数据库操作创建或提升角色，并设置独立密码；不能使用评委/开发种子的固定演示凭据作为公网管理员凭据。

## 4. 数据库与依赖初始化

从仓库部署应使用锁文件安装依赖。默认开发新库的初始化顺序为：

```bash
npm ci
npm run prisma:generate
node -e "require('node:fs').closeSync(require('node:fs').openSync('prisma/dev.db', 'a'))"
npm run db:migrate:deploy
```

创建文件的命令仅对应默认开发路径；生产环境应先确保实际配置的持久化父目录存在，并创建应用可访问的空库，替换上述 `prisma/dev.db` 创建步骤。数据库文件准备好后再执行迁移。已有数据库升级前应备份，再执行 `db:migrate:deploy`；不要用 `db:migrate` 的开发迁移生成流程替代部署迁移。

`npm run seed` 执行的 [prisma/seed.ts](../../../prisma/seed.ts) 会清空多类数据并重建虚构演示账户、模板和资源。只用于专用开发/测试库，正常生产环境会拒绝执行；隔离 E2E 的例外仅允许指定测试数据库。评委启动器使用另一个 [review-seed.ts](../../../prisma/review-seed.ts)，仅在无用户的独立评委库中初始化，重复启动保留已有用户和成长数据。

## 5. 当前页面和业务链路

| 路径 | 当前行为 |
|---|---|
| `/` | 未登录显示介绍界面；已登录按画像状态跳转 `/chat` 或 `/onboarding` |
| `/login` | 登录/注册界面；已登录跳转 `/` |
| `/onboarding` | 兼容入口，转到 `/chat?intent=profile` |
| `/chat` | 主聊天、画像引导、业务卡片及训练会话 |
| `/dashboard` | 成长工作台 |
| `/path` | 职业计划与学习路线 |
| `/simulation` | 场景推荐、预览、开始/恢复训练 |
| `/resources` | 学习资源与已导入岗位样本 |
| `/memory` | 待确认建议、画像/能力和本地记忆 |
| `/settings` | 账户、密码、外观、隐私导出与成长数据清空 |
| `/admin` | 管理员资源审核与模板管理 |

产品聊天入口：

```text
POST /api/chat/conversations/:id/stream
```

接口要求本地 session Cookie 和会话所有权。普通聊天响应为 SSE；未完成训练会话由专用训练服务处理，完成后可在原会话讨论报告。它不是供平台用无状态 Bearer Token 调用的公网 Chat API。

训练专用生成服务使用精简训练上下文，不自动附带普通 V2 完整的 `taskContext`/`evidenceBundle` 和三个工作流开始参数；本地追问或评分契约校验成功不证明云端已经补齐这些参数或调用相应工作流。

业务快照由服务端按权限脱敏、裁剪并传输。当前 V2 主链路不依赖公网业务 MCP 或签名上下文令牌。V2 候选先保存到独立候选表，只有决策接口接受并通过契约、所有权、状态和版本复核，才在事务中投影为正式业务数据：

```text
GET  /api/agentic-v2/candidates
GET  /api/agentic-v2/candidates/:candidateId
POST /api/agentic-v2/candidates/:candidateId/decision
```

## 6. 部署后验证

先检查未登录页面可访问：

```bash
curl -I https://your-domain.example/
curl -I https://your-domain.example/login
```

再用浏览器验证真实边界：

1. 打开 `/` 查看介绍界面，在 `/login` 登录；画像已完成进入 `/chat`，未完成进入画像引导。
2. 确认 `/api/me` 和登录后页面可加载，创建会话并发送消息。
3. 普通聊天应得到 `context`、`delta`、可选 `artifact` 及终态 `done`/`error`；确认消息持久化，刷新能恢复。
4. 真实 API 配置下查看执行元信息：`actualMode=api`、`source=tbox-api`，并确认未降级；有回答不能单独证明上游实际运行。
5. 对一个有效候选在页面执行接受，验证正式记录变化；用未确认候选、版本冲突或跨用户访问验证不能越权写入。
6. 场景预览后开始训练，至少完成 3 个有效回答，再核对评分与报告；创建接口允许 `roundLimit` 为 3–6，当前页面默认 6。
7. 在测试账户的 `/settings` 隐私页导出 JSON，并用 `CLEAR_MY_DATA` 清空成长数据。清空是同步本地事务，保留账户、角色和登录态，不能证明远端平台数据已删除。

本地质量门禁是 `npm run verify`，包含秘密扫描、lint、类型、单元测试、迁移 smoke、评委初始化 smoke 和生产构建。端到端测试另用 `npm run test:e2e`、`npm run test:e2e:v2`；它们使用 Mock 和隔离测试库，不是平台发布验收。

## 7. 服务端配置与数据边界

- API key、session Cookie、上下文密钥和个人 SQLite 数据库不得提交到 Git。真实评委 API 配置仅在明确授权的本地私有交付包中携带。
- 客户端 API 端点校验仅接受 HTTPS 的 `tbox.cn` 或其子域；测试依赖可以显式绕过，生产调用不设置该标记。
- 数据库应放在进程可写、可持久化的位置并限制访问权限；反向代理需正确传递 Cookie 和 SSE。
- `CAREERMATE_CONTEXT_TOKEN_SECRET`、`CAREERMATE_PLUGIN_TOKEN` 与 `/api/mcp/v2` 是仍有实现的独立工具基础设施；当前 V2 主聊天不要求配置它们。启用前需单独验证 Scope、Origin 和跨用户隔离。
- 技术诊断使用 [diagnostics.ts](../../lib/diagnostics.ts) 的元信息字段与敏感键过滤；这不等于聊天数据库不保存用户消息，也不证明所有错误日志具有统一脱敏。

## 8. 公网代理限流与请求体

当前源码没有内置应用限流器，也没有现成代理配置。公网部署者应在代理/网关配置共享限流，阈值按成本和流量调整；以下仅为部署建议，不能视为仓库已经实施：

| 入口 | 示例阈值 |
|---|---|
| `POST /api/auth/login` | 每 IP 5 次/分钟 |
| `POST /api/auth/register` | 每 IP 3 次/分钟 |
| 产品聊天 `…/stream` | 每用户 30 次/分钟 |
| `POST /api/plans/generate` | 每用户 3 次/小时 |
| 自定义场景生成、训练评分 | 每用户按实际模型成本设置 |

代理可返回 HTTP 429、`Retry-After` 和统一 JSON 错误。通用客户端 [client-api.ts](../../lib/client-api.ts) 对 429 提供 `RATE_LIMITED` 默认码及“操作过于频繁，请稍后重试”文案；这不能证明代理已配置，也不代表每个专用 SSE 消费器都走同一个处理函数。

[api.ts](../../lib/api.ts) 的 `parseBodyJson` 默认以 `16 * 1024` 检查 `raw.length`，对空体、坏 JSON 和超限文本归一化错误；目前认证入口使用它，不能称为所有 Route Handler 的统一 UTF-8 字节上限或读取前的流式限制。部署者仍需在代理配置请求体大小上限。
