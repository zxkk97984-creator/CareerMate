# T25b 更新主链路 E2E，覆盖 plan 中 E01–E19（占位：待浏览器环境）

日期：2026-09-06 · 状态：**需浏览器/Playwright 环境执行，本节点环境无法实测**

## 现状

现有 E2E specs：`e2e/p0-flows.spec.ts`、`e2e/chat-home.spec.ts`、`e2e/chat-context-continuity.spec.ts`、`e2e/unified-shell.spec.ts`、`e2e/motion-reduced.spec.ts`。

**`e2e/chat-home.spec.ts` 已与本轮产品明显不符**（本次 session 对聊天产品的改动）：
- 它假设登录后落在 `/` 的独立聊天首页（断言 `/`、`.new-chat-btn`、欢迎语“你好，我是 CareerMate”、侧栏 `.conversation-list`、`.message-*` 在 `/` 直接可见）。
- 本 session 的 T01/T09/T06b/T07a 已：`/chat` → `redirect("/dashboard")`；root 按画像完成度路由到 `/dashboard` 或 `/onboarding`；助手改为页头入口 + 侧栏面板（`assistant-panel`），非根页常驻聊天；聊天 UI 复用 `ChatThread`。
- 因此 `chat-home.spec.ts` 的 `/`、`.new-chat-btn`、欢迎语、侧栏会话、发送消息直接在 `/` 等断言需在真实 DOM 下重写为“经 `/dashboard` 打开助手面板”的流程。

## plan E01–E19 → 现有 spec 映射（代码可判定的映射，运行需浏览器）

| E | 场景 | 现有覆盖 spec（需浏览器运行） |
|---|---|---|
| E01 | 登录后进入工作台 | unified-shell.spec.ts |
| E02 | 无画像引导 | p0-flows.spec.ts |
| E03 | 助手打开/建议/关闭（纯键盘） | 待补（T19 键盘） |
| E04 | 生成计划→待确认→执行 | chat-home.spec.ts（plan generation 段） |
| E05 | 任务状态更新 | 待补 |
| E06 | 参考分/成长档案 | unified-shell.spec.ts（dashboard） |
| E07 | 资源筛选/任务上下文 | 待补（T16） |
| E08 | 训练三轮→评分→返回任务 | 待补（T17） |
| E09 | 记忆候选确认/冲突 | chat-home.spec.ts（candidate 段） |
| E10 | 401 登录过期跳转 | p0-flows.spec.ts |
| E11 | 模块 500 就地重试 | 待补 |
| E12 | 空态（无计划/无记忆/无资源） | 待补 |
| E13 | 隐私清空/导出 | 待补 |
| E14 | 移动端菜单/输入 | chat-home.spec.ts（375/768 段） |
| E15 | 长文本/缩放 | 待补 |
| E16 | 网络失败重试 | p0-flows.spec.ts 部分 |
| E17 | 自定义岗位/无模板/无资源空态 | 待补 |
| E18 | AI 降级标记 | motion-reduced / chat-home 部分（fallback research） |
| E19 | 低动效 | e2e/motion-reduced.spec.ts |

## 结论

- **需要在有 Playwright/浏览器的环境执行**：重写 `chat-home.spec.ts` 为当前产品（dashboard 助手面板）流程，再补 E03/E05/E07/E08/E11/E12/E13/E15/E17 的 spec，运行全部 `test:e2e` 与 `test:e2e:v2`。
- 本节点环境（无浏览器、无 jsdom 运行时）无法验证 DOM 断言，故本条目不标绿、不为通过编写未经运行的断言。

## 完成后应产出

- 重写的 `e2e/chat-home.spec.ts` 与新增各主链路 spec。
- `npm run test:e2e`（基础 mock）与 `npm run test:e2e:v2`（V2 mock）各一次完整运行记录 + 失败 trace/screenshot 路径。
