# CareerMate

CareerMate 是一个基于 Next.js、Prisma、SQLite 和百宝箱 AI 适配层的职业成长工作台。它把职业画像、职业路径、模拟训练、学习资源、长期记忆和 AI 对话放在同一套用户数据闭环中。

当前代码同时支持本地 Mock、手工样例和真实百宝箱 API。Agentic V2 是可选运行路径，不是本地默认值；默认配置以 `.env.example` 和 `src/lib/env.ts` 为准。

## 当前用户入口

| 地址 | 代码行为 |
|---|---|
| `/` | 未登录展示 Landing Page；已完成画像的用户跳转 `/chat` |
| `/login` | 登录和注册 |
| `/onboarding` | 对话式职业画像引导 |
| `/dashboard` | 成长概览、岗位匹配度、能力雷达和当前任务 |
| `/path` | 职业路径、计划版本、时间线和任务状态 |
| `/simulation` | 多轮职场场景训练与评分 |
| `/resources` | 本地资源筛选和百宝箱检索 |
| `/memory` | 待确认建议、画像与证据、长期记忆 |
| `/settings` | 账号（头像、显示名、密码）、AI 陪伴形象、隐私导出与清空 |
| `/admin` | 管理员岗位草稿审核和岗位模板库 |
| `/chat` | 全屏 AI 对话、历史会话、成长档案 |

登录后的主入口为 `/chat`；各业务页顶部的 AI 助手与全屏聊天共享会话、消息和草稿。支持历史恢复、重命名、删除、Markdown、引用、候选卡片和失败重试，继续使用现有百宝箱 API / SSE 链路。

全局浮动 AI 桌宠参考 K12-Learning-platform 的可拖拽实现，默认霜铃精灵动画，动画跟随输入、等待和回复状态；减少动态效果偏好下保留静态姿态。桌宠可拖到任意位置、用方向键移动，位置会记忆并保存在浏览器 localStorage。形象的切换统一在 `/settings → AI 陪伴形象` 完成（可切换 Kurisu Live2D 或收起），悬浮窗不再提供即时切换菜单；隐藏后可点“打开 AI 陪伴形象”恢复。外观选择只影响形象与位置，不影响业务数据或 AI 接入。

## 核心闭环

```text
登录
  → 对话式画像引导
  → 用户确认画像
  → 工作台聚合画像、计划、资源、训练和记忆
  → Kurisu 流式对话 / 页面操作
  → 生成待确认候选
  → 用户接受或拒绝
  → 事务化写入正式业务数据
```

AI 生成的画像更新、能力证据、计划、学习路线和记忆不会直接覆盖正式数据。候选必须通过 Zod Schema、用户所有权、状态和版本校验，并在用户明确确认后投影到数据库。

## 运行架构

```mermaid
flowchart TB
    B[浏览器] --> P[Next.js 页面]
    B --> K[全局 Kurisu 浮窗]
    P --> API[Next.js API Routes]
    K --> CHAT[/api/chat/conversations/:id/stream]
    API --> S[业务服务层]
    CHAT --> S
    S --> DB[(Prisma + SQLite)]
    S --> T[TBox 适配层]
    T --> M[Mock / Manual / API]
    T --> V2[可选 Agentic V2 快照上下文]
    V2 --> ART[CAREERMATE_ARTIFACT]
    ART --> C[候选校验与事务投影]
    C --> DB
```

主要代码边界：

- `src/app/`：页面路由和 API Route Handler。
- `src/components/`：工作台、聊天、Kurisu、候选卡片和通用 UI。
- `src/features/`：dashboard、onboarding、path、simulation、resources、memory、settings、admin 视图。
- `src/lib/chat/`：会话、消息、幂等轮次、上下文、SSE 和持久化。
- `src/lib/tbox/`：百宝箱 HTTP/SSE、检索、Mock/Manual fallback 和结构化结果。
- `src/lib/agentic-v2/`：ArtifactV1 契约、候选创建、候选接受和正式投影。
- `prisma/schema.prisma`：用户、画像、计划、对话、训练、记忆、候选和岗位模板模型。

## AI 运行模式

### 基础 TBox 模式

`TBOX_MODE` 支持三种值：

| 模式 | 行为 |
|---|---|
| `mock` | 使用仓库内确定性 fixture，不需要外部密钥 |
| `manual` | 优先读取本地手工样例，缺失时回退到 Mock |
| `api` | 调用百宝箱 API；失败时依次尝试 Manual，再回退 Mock |

基础适配层位于 `src/lib/tbox/adapter.ts`。运行结果会返回 `requestedMode`、`actualMode`、`degraded`、`fallbackReason` 和 `source`，前端不应把降级结果伪装成实时 AI 结果。

### Agentic V2

设置 `CAREERMATE_AGENTIC_V2=true` 后，聊天请求会按 `TBOX_CONTEXT_TRANSPORT` 发送脱敏业务快照。当前默认 `question_prefix` 会把快照嵌入用户不可见的问题前缀；配置为 `business_data` 时才通过请求字段发送：

- `profileSnapshot`：当前用户画像和已确认能力证据。
- `historySnapshot`：当前用户的计划、进度、模拟和记忆摘要。
- `simulationState`：当前页面明确引用的模拟会话状态。
- `permissions`：允许创建候选，但 `officialWritesAllowed=false`。

V2 返回可读正文和可选的精确 `CAREERMATE_ARTIFACT` 信封。只有 `pending_confirmation` 且通过任务类型、业务数据和版本校验的 artifact 才能创建候选。

本地默认值见 `.env.example`：

```env
TBOX_MODE="mock"
CAREERMATE_AGENTIC_V2="false"
STATEFUL_CHAT_TURNS="true"
TBOX_STRUCTURED_MODE="disabled"
PLAN_V2_WRITE="false"
```

`PLAN_V2_WRITE=true` 才允许新的 V2 计划写入；关闭时仍可读取和转换历史 V1/V2 计划。

## 快速开始

前置条件：Node.js 20.9+、npm。

```bash
git clone <repository-url>
cd CareerMate
npm install
cp .env.example .env
npm run prisma:generate
npm run db:migrate:deploy
npm run seed
npm run dev
```

开发服务器默认地址：`http://localhost:3000`。

`prisma/seed.ts` 会创建虚构的本地测试用户、岗位模板和资源。演示账号只用于本地验收，不要把账号凭据提交或公开分享。

如果本地数据库需要重建，请先备份 `prisma/dev.db`。E2E 测试会使用独立的 `prisma/e2e.db`，不会复用开发数据库。

### 使用同伴提供的环境与数据（团队移交）

若同伴给你的是 `careermate-handoff-config-*.zip`（包含 `.env` 与 `prisma/dev.db`），按以下步骤直接配置并运行：

```bash
# 1. 解压到仓库根目录，覆盖已有 .env，并确保 prisma/dev.db 存在
unzip <你收到的压缩包名>.zip -d .

# 2. 安装依赖 + 生成 Prisma Client
npm install
npm run prisma:generate

# 3. 应用已有迁移（使用现成 dev.db 时通常为无操作）
npm run db:migrate:deploy

# 4. 启动
npm run dev
```

重要约束：

- **不要执行 `npm run seed`**——seed 会清空现有用户、画像、记忆、聊天等数据并重建演示数据。
- `.env` 包含百宝箱 API Key 等密钥，`prisma/dev.db` 包含账号、头像、记忆和聊天等个人数据，两者都不得提交 Git 或公开分享，只能私密移交。
- 数据库中的 `DATABASE_URL` 为相对路径 `file:./dev.db`，换机器无需修改；若开发浏览器插件/MCP，请在 `.env` 中按需配置 `CAREERMATE_MCP_ALLOWED_ORIGINS`、`CAREERMATE_PLUGIN_USER_ID` 和 `ALLOW_UNAUTHENTICATED_PLUGIN`。
- 启动后可用移交账号登录（默认 `student_lin` / `careermate123`），发一条消息确认走的是“百宝箱 API · 真实链路”而非 Mock/演示回复。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Next.js 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run test` | Vitest 单元和集成测试 |
| `npm run test:e2e` | Playwright E2E；自动创建干净 E2E 数据库并使用 3100 端口 |
| `npm run test:migrations` | 数据库迁移冒烟测试 |
| `npm run lint` | ESLint |
| `npm run typecheck` | Prisma generate、Next typegen 和 TypeScript 检查 |
| `npm run secret:scan` | 敏感信息扫描 |
| `npm run verify` | secret scan、lint、typecheck、test、migration、build 全量门禁 |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run db:migrate:deploy` | 应用已有迁移 |
| `npm run seed` | 写入本地虚构种子数据 |

Windows 可把 `npm` 替换为 `npm.cmd`。

## 主要 API 分组

所有内部 API 都使用本地 session Cookie，并返回 `{ ok, data, meta }` 或 `{ ok: false, error, meta }`。

- `/api/auth/*`：注册、登录、退出。
- `/api/me`：工作台聚合数据，包括画像、匹配度、计划、进度和 AI 运行状态。
- `/api/onboarding/*`：画像对话和画像确认。
- `/api/chat/conversations/*`：会话、消息历史、重命名、软删除和 SSE 流式聊天。
- `/api/plans/*`：计划生成、当前计划、计划决策和任务状态。
- `/api/simulations/*`：场景、训练会话、逐轮消息和训练报告。
- `/api/resources`：资源查询和筛选。
- `/api/memories`、`/api/memory/*`：记忆增删改、候选决策和记忆开关。
- `/api/privacy/*`：数据导出和清空成长数据。
- `/api/account`、`/api/account/password`：账号资料（显示名、头像 base64）更新和修改密码。
- `/api/agentic-v2/candidates/*`：V2 候选查询、接受和拒绝。
- `/api/admin/role-drafts/*`：管理员岗位草稿和岗位模板审核。

`/api/tbox/chat`、`/api/tbox/chat/stream` 和旧版 `/api/mcp/*` 保留用于诊断或兼容；产品聊天主链路是 `/api/chat/conversations/:id/stream`。

## 数据模型概览

核心模型位于 `prisma/schema.prisma`：

- 用户与认证：`User`（含头像 `avatarDataUrl`）、`UserProfile`、`AuthSession`。
- 画像引导：`OnboardingConversation`。
- 聊天：`ChatConversation`、`ChatMessage`、`QuestionLedger`、`OperationExecution`。
- 成长计划：`CareerPlan`、`LearningRoute`、`ProgressLog`。
- 训练与证据：`SimulationSession`、`AbilityEvidence`。
- 候选与投影：`ProfileUpdateCandidate`、`AgentArtifactCandidate`。
- 内容与岗位：`ResourceItem`、`RoleTemplate`、`RoleDraft`、`CareerExplorationReport`。
- 记忆：`MemoryItem`。

SQLite 中的复杂字段以 JSON 字符串保存，边界转换统一经过 `src/lib/json.ts`、DTO 和 Zod Schema。

## 安全边界

- 密码使用 bcrypt，登录态使用 httpOnly session Cookie 和数据库 token hash。
- 业务查询绑定当前用户，候选决策不会接受客户端传入的任意 `userId`。
- AI 只能生成候选，不能直接写入正式画像、计划、分数或记忆。
- 画像、计划和学习路线候选使用 `baseVersion` 防止覆盖新数据。
- 正式投影使用所有权检查、严格 Schema、幂等键和数据库事务。
- V2 快照限制字段、数量、文本长度和总字节数；普通敏感度之外的记忆不会进入 V2 上下文。
- 隐私导出不包含 `passwordHash`、头像 base64 和运行密钥；头像需随 `prisma/dev.db` 整体迁移。清空成长数据保留账号和登录态。
- 陪伴形象选择和浮动宠物位置保存在浏览器 localStorage（`careermate-companion-appearance`、`careermate-companion-visible-appearance`、`careermate-companion-position`），不入数据库，换机器后在设置页重新选择即可。
- 真实密钥只能放在未提交的 `.env` 或部署环境变量中。

## 文档与代码真源

代码、`prisma/schema.prisma`、`package.json` 和 `.env.example` 是当前行为的优先真源。其他文档用于解释架构、接口和运行约束；如果文档与代码冲突，应先修正文档或以代码为准，不要依据过时文档推断接口行为。

- [Agentic V2 架构交接](AGENTIC_V2_HANDOFF.md)
- [当前接口设计](docs/接口设计文档.md)
- [主 Agent 配置](docs/tbox/main-agent.md)
- [工作流契约](docs/tbox/workflows.md)
- [知识库边界](docs/tbox/knowledge-bases.md)
- [TBox 评测用例](docs/evaluation/tbox-cases.md)
- [Agentic V2 机器可读评测集](src/agentic-v2/evaluation/cases.json)

`docs/superpowers/` 下的 spec 和 plan 是历史设计记录，不应当被当作当前运行契约。
