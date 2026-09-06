# T01 基线记录与验收证据

日期：2026-09-06 · 基线提交：`e6c14d7` + 当前工作区改动 · 执行：T01 路由固定 · 对应提交：`4e54c6b`

## 1. 当前测试失败清单（T01 验收：记录，不抹除）

正常隔离环境 `npm run test`：

| 文件 | 用例 | 失败原因 | 归属任务（非本轮） |
|---|---|---|---|
| `src/lib/simulation.test.ts` | defines five documented scenarios | 实际已有第 6 个 `career_interview` 场景，断言仍期待 5 个 | T02a（更新场景语义断言） |
| `src/features/simulation/simulation-view.test.tsx` | only claims a candidate when the session actually has one | 断言旧文案“训练得分：82 分”，实际新 UI 为可访问名“综合得分 82 分” | T02a（更新评分语义断言） |

结论：2 个失败均为 T02 职责；T01 未引入新失败，也未修改上述两文件。

## 2. T01 改动范围

修复的路由不一致问题（plan 第 2.1 节）：

- 首页 `/` 原以 `OPEN_CHAT_ENTRY` 决定去向，与 `WorkspacePage`/login 守卫不一致（画像未完成的用户会被送到 dashboard 再被弹回 onboarding）。改为统一按画像完成度路由：已完成→`/dashboard`，未完成→`/onboarding`。
- 删除 `workspace.tsx` 中死代码 `VIEW_BY_PATH["/"] == "chat"` 及“聊天功能已迁移到首页，请返回首页开始对话”的过期提示（违反 plan“不能出现返回首页聊天但首页没有聊天的提示”）。
- `View` 联合类型移除已废弃的 `"chat"`。
- `/chat` 保留为兼容深链接，跳 `/dashboard`（不挂载独立 ChatHome；`?assistant=open` 展开由 T07 接）。

## 3. 修改文件

- `src/app/page.tsx`：首页按画像完成度路由，使用 `homeDestination`，去掉 `isOpenChatEntry` 依赖。
- `src/components/workspace-page.tsx`：复用 `homeDestination`，未登录→`/login`、未完成非引导→`/onboarding`、非 admin→`/dashboard`。
- `src/lib/onboarding-routing.ts`：新增 `homeDestination`（已完成→`/dashboard`，未完成→`/onboarding`）。
- `src/components/workspace.tsx`：删除 dead `chat` 视图分支与过期文案。
- `src/lib/workspace-types.ts`：`View` 移除 `"chat"`。
- `src/app/chat/page.tsx`：注明兼容深链接语义。

## 4. 新增/更新测试

- `src/app/page.test.tsx`（新增）：未登录→落地页；已完成→`/dashboard`；未完成/缺画像→`/onboarding`。
- `src/app/chat/page.test.tsx`（新增）：`/chat` 跳 `/dashboard`。
- `src/components/workspace-page.test.tsx`（新增）：未登录/未完成/完成/非 admin 守卫。
- `src/lib/onboarding-routing.test.ts`（更新）：新增 `homeDestination` 用例。

## 5. 验证命令与结果

- `npx vitest run src/lib/onboarding-routing.test.ts src/app/page.test.tsx src/app/chat/page.test.tsx src/components/workspace-page.test.tsx` → 4 文件 16 用例全部通过（退出码 0）。
- `npx tsc --noEmit` → 通过。
- `npx eslint <改动文件>` → 0 warning/error。
- `npm run test` → 124 文件：122 通过，2 失败（均为 T02 职责）；1077 用例：1075 通过，2 失败。未引入回归。

## 6. 未浏览器验证项 / 剩余风险

- 本任务为服务端路由判定 + 死代码清理，不涉及浏览器交互；四种状态无 loop 由单元测试覆盖。
- `/chat?assistant=open` 自动展开助手面板属于 T07（显式助手入口），本轮未实现，仅保留 `/chat→/dashboard` 基础跳转。
- 登录后已完成用户为 `/login → / → /dashboard` 一次跳转，无 loop；如需直连可后续优化 login 的 nextPath。
