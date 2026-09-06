# T25a E2E 数据/运行模式/浏览器环境隔离

日期：2026-09-06 · 执行：agent

## 目标（plan T25a）

- E2E 显式设置 `CAREERMATE_AGENTIC_V2` 等关键开关，不继承开发机真实服务配置。
- 基础 mock 与 V2 mock 分开运行。
- 使用迁移建立独立测试库，不能只 `db push` 后说迁移验证通过。
- 测试保持独立，不依赖上一用例修改共享 seed。

## 变更

### `scripts/e2e-server.mjs`
- 显式固定关键开关：新增 `CAREERMATE_AGENTIC_V2: process.env.E2E_AGENTIC_V2 ?? "false"` —— 不继承开发机真实配置，默认固定为 false，可用 `E2E_AGENTIC_V2=true` 跑 V2 mock。
- **用迁移建库**：把 `prisma db push --skip-generate` 改为 `prisma migrate deploy`（应用全部迁移到独立 `prisma/e2e.db`），满足“不能只 db push 后说迁移验证通过”。
- 保留：删除旧 `e2e.db`、独立 `DATABASE_URL`、`TBOX_MODE: mock`、`CAREERMATE_E2E`、`ALLOW_DESTRUCTIVE_SEED`、全新 seed。

### `package.json`
- 新增 `test:e2e:v2`（`E2E_AGENTIC_V2=true playwright test`）与 `e2e:serve:v2`（`E2E_AGENTIC_V2=true node scripts/e2e-server.mjs`），把**基础 mock 与 V2 mock 分开运行**。

### `playwright.config.ts`
- 沿用 `use.baseURL = 127.0.0.1:3100`、`workers: 1`、`retries: 0`、trace/screenshot only-on-failure。
- 浏览器：`channel: "chrome"`（需要系统/CI 可安装的 Chrome 或 Playwright 自带 Chromium，二选一的 documented 方案；当前选 chrome channel）。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 迁移 smoke（fresh deploy via migrations） | `npm run test:migrations` | 通过（fresh/drift/legacy/FK） |
| e2e-server 语法 | `node --check scripts/e2e-server.mjs` | 通过 |
| 全量 lint | `npm run lint` | 0/0 |
| 类型检查 | `npx tsc --noEmit` | 通过 |

## 剩余风险 / 待浏览器/CI 验证

- **E2E 实际运行需浏览器**（`test:e2e`/`test:e2e:v2` 启动 build + 服务 + Playwright），本节点环境无浏览器，无法实测 P0 流程（E01–E19）；运行结果与产物属 T25b/T25c。
- 浏览器方案：`channel: "chrome"` 需环境有 Chrome；若 CI 用 Playwright 自带 Chromium，需在部署/CI 配置中切换 `channel` 或安装 Chrome（T25c 记录）。
- `migrate deploy` 在含 T21a（CareerPlan 唯一 + 去重）与 T24（ProgressLog dedupeKey）迁移的新库上已验证可应用（migration-smoke 通过）。
