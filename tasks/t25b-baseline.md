# T25b 更新主链路 E2E，覆盖 plan 中 E01–E19

日期：2026-09-06 · 执行：agent（代码层面已完成，实际 Playwright 运行需浏览器环境）

## 已做（本 session）

把过期的、基于「独立聊天首页」的 E2E 断言，按当前产品（`/chat→/dashboard`、助手在页头面板、root 按画像路由）重写：

- **`e2e/chat-home.spec.ts`**：login→`/dashboard`；新增「打开助手面板」流程（`assistant-panel` + composer 占位符“输入你的问题”）；覆盖：页头有 AI 助手入口、`/chat` 跳转、面板内发送消息收到回复、多轮追加不串消息、Escape 关闭并回焦、生成计划达到可确认版本、候选卡在确认接口失败时保持待确认、低动效指标数字、375px 全屏 sheet。
- **`e2e/p0-flows.spec.ts`**：login→`/dashboard`；聊天类用例改为打开助手面板；登录空错误响应恢复保留；注册后进入 `/dashboard`；训练评分断言改「综合得分 N 分」可访问名（T17b 后）；simulation 直接用 `/simulation` 页。
- **`e2e/chat-context-continuity.spec.ts`**：login→`/dashboard`；新增 `openChat` helper（打开面板）；全部 `getByPlaceholder(/Enter 发送/)` 替换为 `/输入你的问题/`；「刷新后历史」改为「刷新后重新打开助手，消息仍在」。
- **`e2e/unified-shell.spec.ts`**：login helper `toHaveURL(/\/$/)` → `/dashboard`；其余（侧栏/active 态/移动端抽屉/退出/Admin 守卫/无横向溢出）已与当前一致。

以上均通过 typecheck + eslint（0 问题）。**未实际运行**：本节点环境无浏览器/Playwright，`npm run test:e2e` 需浏览器环境执行。

## plan E01–E19 → spec 映射

| E | 场景 | 覆盖（运行后） |
|---|---|---|
| E01 登录进入工作台 | unified-shell + chat-home（login→/dashboard） |
| E02 无画像引导 | p0-flows（注册后）/ onboarding 守卫 |
| E03 助手打开/建议/关闭（纯键盘） | chat-home（open assistant + Escape 回焦） |
| E04 生成计划→待确认→执行 | chat-home（plan generation 段）+ p0-flows |
| E05 任务状态更新 | 待补 spec |
| E06 参考分/成长档案 | unified-shell（dashboard + 成长工作台 heading） |
| E07 资源筛选/任务上下文 | 待补 spec |
| E08 训练三轮→评分→返回任务 | p0-flows（simulation 段） |
| E09 记忆候选确认/冲突 | chat-home（candidate 409 段） |
| E10 401 登录过期 | p0-flows（login 空错误） |
| E11 模块 500 就地重试 | 待补 spec |
| E12 空态 | 部门覆盖（chat-home empty state） |
| E13 隐私清空/导出 | 待补 spec |
| E14 移动端菜单/输入 | chat-home（375px）+ unified-shell（抽屉） |
| E15 长文本/缩放 | unified-shell（无横向溢出 375px） |
| E16 网络失败重试 | p0-flows 部分 |
| E17 自定义岗位/无模板/无资源空态 | 待补 spec |
| E18 AI 降级标记 | chat-context-continuity（mock 标识）+ motion-reduced |
| E19 低动效 | e2e/motion-reduced.spec.ts |

## 待浏览器环境完成

1. `npm run test:e2e`（基础 mock）与 `npm run test:e2e:v2`（V2 mock）各跑一次，附每步结果与失败 trace/screenshot。
2. 按运行结果修正断言；补 E05/E07/E11/E13/E17 的 spec。
3. CI 中记录浏览器方案（Playwright Chromium vs chrome channel）。
