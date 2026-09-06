# T06b 挂载正文、引用、候选与执行来源渲染

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T05/T06a/T08a/T08b/T09）/ 当前 · 执行：T06b · 对应提交：`ed8cff5`

## 1. 实现内容

### `src/components/chat/assistant-panel.tsx`（新增）
把 T06a 的控制器传入既有渲染原语，实现“正文/引用/候选/执行来源”的完整可见展示：
- `<ChatThread messages={controller.messages} activeConversationId onNewChat={controller.newChat} onQuickAction onQuickAction={(id,v)=>controller.send(v)} />`——ChatThread 内部用 `MemoizedMarkdown` 渲染正文、用 `MessageParts` 渲染引用/候选（`profile_candidate_ref` / `agent_artifact_candidate_ref` / 快捷动作），保留 `parts` 与 `status`。
- `<ChatComposer onSend={controller.send} disabled={controller.streaming} activeConversationId />`——Enter 发送 / Shift+Enter 换行 / composing 不误发（ChatComposer 自带）。
- `controller` 提供单一消息状态源（activeConversation/messages/stream/draft）。

### `src/app/layout.tsx`
- 用 `AssistantProvider` 包住 `children` + `GlobalKurisu`：控制器在跨工作台导航保持挂载，避免路由切换重建/丢失会话与草稿（plan 2.2）。

## 2. 复用与不重复

- 复用既有 `ChatThread`/`ChatComposer`/`MessageParts`/`MemoizedMarkdown`，不整份复制；不新增 Markdown/candidate 渲染。
- 未触碰 `message-parts.tsx`（另一 agent WIP）——仅作为已存在的导出被 import。
- 来源/降级：ChatThread 由 `msg.executionMeta` 展示执行来源；`unknown`/`pending` 不标记为 API 成功（controller 仅在 `sseResult.meta` 非空时写入 executionMeta）。

## 3. 验证命令与结果

- `npm run test` → 127 文件 / 1111 用例全部通过。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0（Compiled successfully）。

## 4. 修改文件

`src/components/chat/assistant-panel.tsx`（新增）、`src/app/layout.tsx`。

## 5. 未完成 / 说明

- 面板**入口/开合/宽度/手机 sheet/焦点**属于 T07a/T07b（显式助手入口 + 手机 sheet + 关键焦点）。本轮把 `AssistantProvider` 挂到根 layout、把 `assistant-panel` 接好 controller，但未强制显示面板（需 open 触发，T07a 提供）。
- 历史恢复不丢 parts、mock 与 V2 fixture 下正文/引用/候选表现、来源标记，需浏览器验证，留 T19/T25 浏览器轮次。
