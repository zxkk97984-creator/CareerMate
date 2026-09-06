# T06a 提取唯一助手控制器，保证幂等、隔离与失败恢复

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T05/T08a/T08b/T09）/ 当前 · 执行：T06a

## 1. 实现内容

### `src/lib/assistant-controller-utils.ts`（新增，纯逻辑可单测）
- `resolveClientRequestId(state, isRetry)`：**一条逻辑发送复用同一 `clientRequestId`**——
  - 新提问（非重试）→ 生成新 ID；
  - 失败重试（isRetry=true 且有当前 ID）→ 复用现有 ID，让服务端幂等去重，避免重复用户消息/候选。
- `beginSubscription` / `isCurrentSubscription`：**订阅隔离**——每次接收一个会话的流式响应新建序号；切换会话时递增使旧订阅失效，旧会话的加增量/构件不会写入新会话。

### `src/hooks/use-assistant-controller.ts`（新增，单一消息状态源）
`useAssistantController()` 拥有 `{ activeConversationId, messages, streaming, phase, draft }`，并暴露 `send / newChat / openHistory / switchConversation / setDraft / retry / closePanel`：
- **单一状态源**：只维护一套 messages，供助手面板与 Kurisu 共用；不再各自维护第二套消息数组。
- **切换隔离**：`switchConversation` 先 `subSeqRef += 1` 使进行中订阅失效，再 `openHistory`；SSE 的 onDelta/onArtifact 都先 `isCurrentSubscription` 判断，旧流不写入新会话。
- **幂等重试**：发送失败保留 `requestIdRef.current` 与草稿/消息，`retry`/再次 `send` 复用同一 `clientRequestId`；成功后重置 ID 以便新提问生成新 ID。
- **保留 parts/meta**：历史加载直接取 `data: MessageItem[]`（含 id/parts/status/executionMeta）；流式用 `consumeFrontendSseResponse` 累积 text part 与 artifact part，完成时写入 `executionMeta`（来源），不退化为纯字符串。
- **关闭不清草稿**：`closePanel` 仅隐藏，不丢弃当前流或草稿（状态保留在 provider）。
- **refs 规则**：`requestIdRef`/`subSeqRef` 只在事件/异步里访问，未在渲染期读取（避免 `react-hooks/refs`）。

### `src/components/chat/assistant-provider.tsx`（新增）
`AssistantProvider` + `useAssistantControllerContext`：在跨工作台导航保持挂载的层挂载同一控制器，避免路由切换重建/丢失会话与草稿。

## 2. 测试

`src/lib/assistant-controller-utils.test.ts`（5 用例）：
- 新提问生成新 ID；**失败重试复用同一 ID**（不会产生两轮）；只有真正的新提问才生成新 ID。
- 订阅 guard：序号递增、只有当前订阅可写；切换到新会话后旧订阅失效、不会覆盖新会话。

（控制器 hook 本身为 React + fetch，需浏览器挂载；其核心不变量——幂等复用 requestId、切换订阅隔离——已由纯函数测试覆盖。）

## 3. 验证命令与结果

- `npm run test` → 127 文件 / 1111 用例全部通过（新增 5 用例）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0（Compiled successfully）。

## 4. 修改文件

`src/lib/assistant-controller-utils.ts`（新增）、`src/lib/assistant-controller-utils.test.ts`（新增）、`src/hooks/use-assistant-controller.ts`（新增）、`src/components/chat/assistant-provider.tsx`（新增）。

## 5. 说明 / 后续

- 本任务交付控制器与 provider（单一消息状态源 + 幂等 + 隔离 + 保留 parts/meta/draft）。**未挂载任何 UI**；把 `AssistantProvider` 挂到根 layout 并在面板/页头/浮窗共享同一 controller，属 T06b（完整消息与结构化结果展示）/ T07a/b（显式入口与手机 sheet）。
- 未触碰 `message-parts.tsx` / `chat-home.tsx`（另一 agent 的聊天状态 WIP）；本控制器为新建共享层，与既有 Kurisu 浮窗的本地状态可在 T07 逐步收敛。
- 浏览器级体验（串话、重试不丢输入、关闭不丢草稿）留待 T19/T25 浏览器轮次。
