# T22 流式服务按职责小步拆分，兼容行为不变

日期：2026-09-06 · 执行：agent

## 目标（plan T22）

- 按“准备上下文 / 消费模型事件 / 确认完成并持久化”拆可测试职责。
- 拆分前后事件顺序、幂等、中断、候选创建行为一致。
- 主函数能直接读出一轮对话生命周期。
- 不引入通用多层 pipeline、不删兼容模式。

## 思路与范围

`stream-service.ts` 是 ~1300 行的关键聊天流式路径，且与另一 agent 正在改的聊天 WIP 相邻。在节点环境无浏览器、无法验证流式行为的前提下，**不重构控制流**，而是采用 plan 允许的“新增有限数量纯 helper”小步拆分：把 3 个无副作用、可独立测试的纯函数从主文件提取到 `stream-helpers.ts`，主流程改为 import 同一逻辑，**行为逐字一致**。保留 stateful/legacy/V2 分支与兼容模式。

## 变更

### 新增 `src/lib/chat/stream-helpers.ts`
无副作用纯函数（从 stream-service 原样迁移）：
- `resolveSearchPolicy(userMessage, { searchPolicy, scope })`：决定 off/allowed/required。
- `buildProviderHistory(messages, excludeUserMsgId)`：构建 provider_history 模式历史消息。
- `validateSourceRefs(sourceRefs, _toolCalls, citations)`：校验 sourceRefs 与 citations 绑定（保留 `_toolCalls` 形参兼容调用签名）。

### 修改 `src/lib/chat/stream-service.ts`
- 顶部 import 上述 3 个 helper。
- 删除本地重复的 `buildProviderHistory`/`resolveSearchPolicy`/`validateSourceRefs` 定义（约 -85 行）。
- 调用点不变（`resolveSearchPolicy(message, agentContext)`、`buildProviderHistory(messages, turn.userMessageId)`、`validateSourceRefs(agentResponse?.sourceRefs, toolCalls, citations)`）。

### 新增 `src/lib/chat/stream-helpers.test.ts`
7 用例：非职业 scope off、显式联网/时效 required、其余回退 searchPolicy、仅 completed 且排除本轮 + 截断 12 条、长内容截断 800 字、sourceRefs 校验、空/非法输入 []。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 单测（stream-helpers） | `npx vitest run src/lib/chat/stream-helpers.test.ts` | 7/7 |
| 既有 stream 回归 | `npx vitest run …stream-service.test.ts …stateful.test.ts` | 24/24 通过（行为未被破坏） |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 136 文件 / 1180 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待浏览器验证

- 本轮为“纯 helper 提取”，未对控制流/分隔的职责做更大重构——在无法运行真实流式的节点环境，刻意不做高风险控制流重组；stateful/legacy/V2 开/关的回归由既有 24 用例 + 全量测试覆盖。
- 真正的“一轮对话生命周期可读性”重构与流式中断/幂等的浏览器级验证留待有浏览器的环境（T25）或后续 session。
- 未引入多层 pipeline，未删任何兼容模式。
