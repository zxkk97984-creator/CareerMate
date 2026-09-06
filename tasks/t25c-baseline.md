# T25c CI 门禁与失败产物，更新真实验证说明

日期：2026-09-06 · 执行：agent · 对应提交：`7937325`（verify 门禁本环境已全绿 EXIT=0；真实 GitHub Actions 运行待触发）

## 目标（plan T25c）

- CI 干净 checkout 可安装、迁移、build、test；失败上传 trace/screenshot/log，禁止上传 .env/用户 DB。
- `npm run verify` 与 E2E 独立明确执行；README/评估材料不把未执行项目标绿。
- 使用 CI 可安装的浏览器（Playwright 自带 Chromium 或明确安装 chrome 的一种方案）。

## 变更

### 新增 `.github/workflows/ci.yml`
- 触发：`pull_request` 与 `push` 到 main/master。
- `permissions: contents: read`（最小权限）。
- **verify 作业**：checkout → setup-node(22) → `npm ci` → `npm run verify`（secret:scan→lint→typecheck→test→test:migrations→build）。
- **e2e 作业**（`needs: verify`）：checkout → setup-node → `npm ci` → `npx playwright install --with-deps chromium` → `npm run build` → `npm run test:e2e`（基础 mock）→ `npm run test:e2e:v2`（V2 mock）。
- **失败产物上传**：`test-results/`、`playwright-report/`、`e2e/**/trace.zip`、`e2e/**/screenshot-*.png` → artifact `playwright-failure-artifacts`（`if: failure()`；`if-no-files-found: ignore`）。
- **不包含 .env / 用户数据库**：artifact 路径仅限 Playwright report/trace/screenshot；`.env*`、`prisma/*.db`（dev.db/e2e.db）不在任何上传路径内，且 repo gitignore 已排除（secret:scan 也会拦截）。

### 修改 `playwright.config.ts`（T25c）
- `isCi = Boolean(process.env.CI)`：CI 用 Playwright 自带 Chromium（bundled）；本地默认系统 Chrome（`channel: "chrome"`）。满足“选择 Playwright 自带 Chromium 或明确安装 chrome 的一种方案”。

### 修改 `scripts/secret-scan.mjs`
让门禁对**合法非敏感文件**准确放行（而非禁用规则——真实凭据规则仍生效）：
- 设计令牌样式 `src/app/styles/tokens.css` 加入路径放行（其内容仍会跑 contentPatterns 扫描）。
- `tasks/audit-*/` 审查截图加入允许二进制（评审交付物，非秘密）。
- 修正审计截图 binary 匹配正则。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 完整门禁 | `npm run verify` | 通过（secret:scan→lint→typecheck→test 140/1196→migrations→build exit 0） |
| CI YAML 合法 | `node` 解析 / js-yaml | 合法 |
| 脚本存在 | `package.json` 读取 | verify / test:e2e / test:e2e:v2 均存在 |
| secret:scan 精确性 | `npm run secret:scan` | 通过（真实凭据规则保留；仅放行设计 token css 与审查截图二进制） |

## 剩余风险 / 待真实 CI

- 真实 GitHub Actions 运行（clean checkout 安装/迁移/构建/测试/E2E）需有仓库 CI 环境；本节点无法触发 CI。
- E2E 实际运行结果（E01–E19）与失败 trace 产物需在 CI/有浏览器环境收集（见 T25b）。
- CI 需在 main 分支启用 branch-protection required checks；仓库层面由管理员配置。
- `secret:scan` 对设计 token css / 审查截图放行属于“准确放行”，未豁免任何真实 secret 规则（API key、bearer token、OpenAI key、密码等仍会被拦）。
