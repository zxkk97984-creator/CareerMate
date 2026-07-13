# CareerMate

AI 职业导航与终身学习伙伴系统 —— 为浙江大学学生服务创新大赛开发的本地原型，基于 Next.js 16 + Prisma + SQLite + 蚂蚁百宝箱。

## 功能概览

- **聊天首页**：持久化多会话、SSE 流式对话、画像候选确认、计划生成、职业探索报告
- **成长仪表盘**：能力雷达图、匹配度分析、近期进度
- **职业路径**：三年滚动计划、月度里程碑、90 天任务、本周行动
- **模拟训练**：多轮职场模拟对话、自动评分
- **资源中心**：按岗位和能力维度筛选的学习资源
- **画像引导**：对话式 onboarding 收集用户背景信息
- **MCP 兼容层**：JSON-RPC 2.0 端点，5 个业务工具，Token 用户绑定
- **Admin**：岗位模板草稿生成与审核

## 技术栈

| 领域 | 选型 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript 5.9 |
| 前端 | React 19 + Tailwind CSS v4 |
| 数据库 | SQLite (Prisma 6 ORM) |
| 运行时校验 | Zod 3 |
| 测试 | Vitest 3 (单元) + Playwright 1.61 (E2E) |
| AI | 蚂蚁百宝箱 API (mock 模式默认可用) |

## 前置条件

- Node.js 18+ 
- npm（Windows 用户使用 `npm.cmd`）

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/zxkk97984-creator/CareerMate.git
cd CareerMate

# 2. 安装依赖
npm.cmd install

# 3. 配置环境变量
copy .env.example .env.local
# .env.local 已默认为 mock 模式，无需修改即可运行

# 4. 初始化数据库并填充种子数据
npm.cmd run prisma:generate
npm.cmd run db:migrate:deploy
npm.cmd run seed

# 5. 启动开发服务器
npm.cmd run dev
```

打开 http://localhost:3000 即可使用。

## 演示账号

种子数据包含以下测试账号，密码均为 `careermate123`：

| 账号 | 显示名 | 身份 | 目标岗位 |
|------|--------|------|---------|
| `student_lin` | 小林 | 大三·数字媒体技术 | AI 产品经理 |
| `student_chen` | 小周 | 大二·统计学 | 数据分析师 |
| `student_wu` | 小陈 | 大三·新闻传播 | AIGC 内容运营 |
| `worker_zhao` | 阿敏 | 职场新人·运营1年 | AI 产品经理（转岗） |
| `career_switch_li` | 宇航 | 新媒体运营 | 数据分析师（摇摆中） |
| `admin` | 管理员 | - | 管理员（审核岗位草稿） |

## Mock 模式与真实百宝箱

默认 `TBOX_MODE=mock`，所有 AI 对话使用本地固定响应，无需百宝箱凭证即可运行完整流程。

如需接入真实百宝箱 API，在 `.env.local` 中修改：

```
TBOX_MODE="api"
TBOX_API_KEY="你的API密钥"
TBOX_APP_ID="你的应用ID"
TBOX_AGENT_ID="你的智能体ID"
TBOX_DATASET_ROLE_COMPETENCY="职业能力知识库ID"
TBOX_DATASET_LEARNING_RESOURCES="学习资源知识库ID"
TBOX_DATASET_SIMULATION_SCENES="训练场景知识库ID"
TBOX_DATASET_ETHICS_RULES="伦理规则知识库ID"
```

真实 API 验收结果见 `docs/tbox/acceptance-evidence.md`。

## 可用脚本

```bash
npm.cmd run dev              # 启动开发服务器
npm.cmd run build            # 生产构建
npm.cmd run start            # 启动生产服务器

npm.cmd run test             # 运行单元测试
npm.cmd run test:watch       # 监听模式
npm.cmd run test:e2e         # 运行 E2E 测试
npm.cmd run test:migrations  # 数据库迁移冒烟测试

npm.cmd run lint             # ESLint 检查
npm.cmd run typecheck        # TypeScript 类型检查
npm.cmd run secret:scan      # 敏感信息扫描

npm.cmd run verify           # 全量质量门禁（扫描+lint+类型+测试+迁移+构建）

npm.cmd run seed             # 重新填充演示数据（会覆盖已有数据）

npm.cmd run db:migrate       # 开发环境创建新迁移
npm.cmd run db:migrate:deploy # 应用已有迁移
```

## 项目结构

```
src/
├── app/                      # Next.js App Router 页面与 API 路由
│   ├── api/
│   │   ├── auth/             # 登录/注册
│   │   ├── chat/             # 聊天（会话、消息、SSE 流）
│   │   ├── careers/          # 职业探索报告
│   │   ├── mcp/              # JSON-RPC MCP 端点
│   │   ├── plans/            # 职业计划（生成、确认、重规划）
│   │   ├── profile/          # 画像候选
│   │   └── ...
│   ├── page.tsx              # 聊天首页（/）
│   ├── dashboard/            # 成长仪表盘
│   ├── path/                 # 职业路径
│   ├── simulation/           # 模拟训练
│   └── ...
├── components/
│   ├── chat/                 # 聊天组件（首页、侧栏、输入框、消息渲染、卡片）
│   └── workspace.tsx         # 多页面工作台布局
├── lib/
│   ├── chat/                 # 聊天服务层（仓储、服务、流式、artifact）
│   ├── careers/              # 职业探索（schema、服务）
│   ├── plans/                # 计划服务（生成、重规划）
│   ├── profile/              # 画像服务（候选、能力证据）
│   ├── tbox/                 # 百宝箱适配层（流式、检索、SSE）
│   ├── tools/                # MCP 工具注册表
│   └── ...
└── ...
docs/                         # 项目文档
prisma/                       # 数据库 Schema 与迁移
e2e/                          # E2E 测试用例
```

## 安全

- `.env.local` 不入库。真实密钥只存在于本地或部署环境变量中
- 插件/MCP 调用的 userId 和 scopes 仅从服务端环境读取，不接受工具参数覆盖
- 画像、计划写入均需用户手动确认，AI 不能绕过
- 跨用户数据隔离：所有查询绑定 userId
- `npm.cmd run secret:scan` 在 `verify` 流程中自动执行

## 文档

| 文档 | 说明 |
|------|------|
| `docs/AI职业导航项目方案.md` | 项目整体方案 |
| `docs/产品需求文档_PRD.md` | 产品需求文档 |
| `docs/接口设计文档.md` | API 接口设计 |
| `docs/tbox/acceptance-evidence.md` | 百宝箱 5 场景真实 API 验收证据 |
| `docs/tbox/百宝箱配置清单.md` | 百宝箱配置清单 |
| `docs/evaluation/tbox-cases.md` | 40 条百宝箱评测用例 |
| `docs/evaluation/user-testing.md` | 用户测试计划 |
