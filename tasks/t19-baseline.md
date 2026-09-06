# T19 键盘、复制、低动效、手机安全区与缩放检查

日期：2026-09-06 · 执行：agent · 对应提交：`35fe8eb`

## 目标（plan T19 / 4.5 无障碍与交互）

- 审核焦点 / aria-controls / inert；正文允许选取。
- modal 正确圈定焦点，非模态不圈定。
- reduced motion 检测用于 GSAP / Recharts / 角色 iframe，恢复偏好时行为正确。
- 检查 sticky 输入和安全区。
- 纯键盘“打开助手→关闭返回”无焦点丢失。

## 现状盘点（相当部分已在既有代码覆盖）

- **GSAP / Recharts**：`src/lib/motion/motion-safe.ts`（`queryMotionSafe`/`getMotionSafe`/`useMotionSafe`）订阅 `prefers-reduced-motion: reduce`；`settle.ts`、`count-up.tsx`、`landing-motion`、`fluid-background` 均据此门控。`e2e/motion-reduced.spec.ts` 存在（reduce 下关键元素可见且 opacity=1、CountUp 落最终值）。
- **手机 sheet / safe-area / sticky**：`.assistant-panel` 手机态 `100dvh + env(safe-area-inset-top/bottom)`（globals.css 6032-6045），composer `flex-shrink:0` 贴键盘上沿。
- **modal 圈定 / 非模态不圈定**：`ConfirmDialog`（T18）Escape 关闭 + 焦点圈定 + 关闭后回焦；助手面板为非模态侧栏，只 Escape 关闭回焦、不做 focus trap。

## 本次变更

### 修改 `src/app/globals.css` —— 正文允许选取/复制
原全局 `* { user-select:none; caret-color:transparent }` 使消息/卡片/报告文本均不可选中复制。改为：内容区（`.message-text`、`.parts-citation-list`、`.memory-card`、`.sim-report`、`.sim-brief`、`.sim-turn`、`.path-notes`、`.note-list`、`.path-section`、`.resource-card`、`.surface-card p/li` 等）`user-select:text` 可复制；交互控件与装饰（button/a/summary/label/select/`.cm-dot-tag`/`.weak-chip`/`.sim-scenario-chip`/`.sim-brief-dim`/`.sim-report-badge`/`.resource-type`）保持不可选中，保留应用手感。

### 修改 `src/components/chat/kurisu-avatar.tsx` —— 角色 iframe 低动效
等待/收尾的 `kurisuPlayMotion("thinking"|"mtn_01")` 仅在 `motionSafe` 时播放；`reduced motion` 下 iframe 不再持续播放思考/动作动画，仅保留必要的说话/闭嘴状态。

### 修改 `src/components/chat/assistant-panel.tsx` + `src/components/shell/assistant-entry-button.tsx` —— 焦点 / aria
- 面板 `<aside>` 增加 `id="assistant-panel"`，与入口 `aria-controls` 对应。
- 入口按钮补 `aria-expanded`（反映 panelOpen）、`aria-haspopup="dialog"`。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 改动文件 lint | `npx eslint` 3 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 134 文件 / 1163 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待浏览器验证

- 节点环境无真实浏览器/无 jsdom：纯键盘“打开助手→打开建议→关闭返回”、360px/200% 缩放、对比度、文本选中复制、iframe 低动效的实际浏览器验证与 `e2e/motion-reduced.spec.ts` 运行需在有浏览器环境执行（T25 收口）。
- 文本选中策略为内容区开放、交互控件禁用，具体对比度/选中边界以浏览器实测为准。
- modal 焦点圈定在 T18 ConfirmDialog 已实现，非模态助手面板不圈定，符合 plan 4.5。
