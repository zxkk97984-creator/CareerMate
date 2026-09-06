# T07a 增加显式 AI 助手入口，角色共享 controller

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T06/T08/T09）/ 当前 · 执行：T07a

## 1. 实现内容

### `src/components/shell/assistant-entry-button.tsx`（新增）
- 页头常驻“AI 助手”文字按钮，点击 `controller.openPanel()` 打开同一助手面板。
- 原生 `<button>`：普通点击、Tab+Enter、触摸均可触发；带 `aria-label="AI 助手"` 与 `aria-controls`。
- 图标用 lucide-react `Bot`（非 emoji），16px。

### `src/hooks/use-assistant-controller.ts`
- 增加面板开合/展开状态：`panelOpen`、`expanded`，以及 `openPanel`/`closePanel`/`togglePanel`/`toggleExpanded`。
- `closePanel` 现在只隐藏面板（不丢流/草稿，状态保留在 provider）；不再误设 streaming=false。

### `src/components/chat/assistant-panel.tsx`
- 由 `panelOpen` 决定是否渲染；宽度 420px（桌面右侧），`expanded` 时 760px“展开阅读”。
- 顶部：标题、当前会话（由 controller 持有）、新对话、关闭，icon button 均带 `aria-label`。
- 用 `<aside aria-label="AI 助手">`（非模态侧面板，不用 aria-modal/focus trap，不限制主区访问——符合 plan 4.5）。
- 复用既有 `ChatThread`（Markdown/引用/候选）+ `ChatComposer`。

### `src/app/layout.tsx` + `src/components/workspace.tsx`
- 根 layout 渲染 `<AssistantPanel />`（关闭时返回 null，不占位；不悬挂一套独立 ChatHome）。
- 工作台页头 `PageHeader` 的 `actions` 里放 `<AssistantEntryButton />`，所有工作台页可见显式入口。

## 2. 角色共享 controller

- 面板与页头入口都通过 `useAssistantControllerContext()` 读取**同一** controller（单一消息状态源），不再各自维护第二套消息数组。
- Kurisu 角色点击调用 `openPanel` 的收敛（把 kurisu-chat-window 的本地 localMessages/localCidRef 迁移到 controller）属 T07a 的收尾/风险点——因 kurisu-chat-window 与 message-parts 均为他人聊天 WIP 范围，本轮未强制改其内部状态，仅让“打开面板”这一动作走共享控制器入口。

## 3. 验证命令与结果

- `npm run test` → 127 文件 / 1111 用例全部通过。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0（Compiled successfully）。

## 4. 修改文件

`src/components/shell/assistant-entry-button.tsx`（新增）、`src/hooks/use-assistant-controller.ts`、`src/components/chat/assistant-panel.tsx`、`src/app/layout.tsx`、`src/components/workspace.tsx`。

## 5. 未完成 / 说明

- 手机 sheet（`100dvh` + safe-area）、键盘焦点圈定、角色收起/静态 fallback、Live2D 失败替代 → 属 T07b。
- “退出账号清除客户端会话状态”、390px 输入区可用、关闭回焦 → T07b / T19。
- 浏览器级“页头打开面板、Kurisu 也打开同一面板、导航后会话/草稿保留”需浏览器验证，留 T19/T25。
