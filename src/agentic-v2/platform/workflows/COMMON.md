# V2 工作流共同契约

开始参数均为文本：`request`、`context_token`、`task_context_json`、`evidence_bundle_json`，全部必填。`context_token` 只允许传给 CareerMate业务MCP V2，不得输出、记录或发送给联网搜索。

处理规则：

1. `evidence_bundle_json` 是四路证据包：已确认画像、成长历史、职业基线、市场证据。四路来源必须保持独立。
2. JSON 无法解析、令牌失败、缺少关键输入或工具失败时，返回 `needs_input` 或 `error`，禁止补造数据。
3. 输出必须满足 AgentArtifactV1，不加 Markdown 代码围栏：

```json
{"schemaVersion":"1.0","taskType":"","status":"success|needs_input|pending_confirmation|error","summary":"","data":{},"evidence":[],"sources":[],"assumptions":[],"warnings":[],"requiresUserConfirmation":true,"baseVersion":null,"nextActions":[]}
```

4. `baseVersion` 取画像或计划的当前版本；不可得时为 `null`。
5. 工作流只生成候选，不直接覆盖画像、分数、证据、计划、记忆或进度。
6. 结束节点返回变量 `artifact`。若官方调用链要求直接回复，则直接回复只引用同一 `artifact` 一次，并在主 Agent 联调中验证无重复。
