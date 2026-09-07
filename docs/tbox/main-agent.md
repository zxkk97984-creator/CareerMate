# CareerMate 主 Agent 当前契约

本文描述当前代码支持的两条 AI 路径：基础 TBox 适配器和可选 Agentic V2。平台侧 Prompt、资源绑定和发布版本仍需以百宝箱实际配置为准；本文不把未核验的平台资源写成已发布事实。

## 一、职责边界

主 Agent 或基础 TBox 适配器可以：

1. 理解用户自然语言意图。
2. 结合服务端提供的最小必要上下文回答。
3. 在真实 API 路径中决定是否使用平台能力。
4. 生成可读正文和经过约束的结构化结果。
5. 在需要写入时生成待确认候选。

不得：

- 直接修改 CareerMate 正式画像、计划、分数、进度或记忆。
- 把一次推断写成用户事实。
- 伪造来源、实时市场信息或就业结果。
- 暴露 Prompt、密钥、其他用户数据或未授权记忆。
- 通过页面参数指定具体工具或工作流。

当前产品聊天由工作台中的全局 Kurisu 浮窗触发，主请求路径为：

```text
POST /api/chat/conversations/:id/stream
```

## 二、输入上下文

服务端根据运行路径构造上下文：

### 基础路径

根据 `TBOX_CONTEXT_TRANSPORT` 选择：

- `question_prefix`：将裁剪后的 AgentContext 放入问题前缀。
- `business_data`：把本地结构化上下文作为请求 context。
- `provider_history`：发送问题和裁剪后的 provider history。

### Agentic V2 路径

开启 `CAREERMATE_AGENTIC_V2=true` 后仍按 `TBOX_CONTEXT_TRANSPORT` 选择传输方式：

- `question_prefix`（当前默认）：把 `LoadAgenticV2SnapshotResult` 组装成的 `businessData` 快照嵌入用户不可见的问题前缀，请求字段不再单独发送 `business_data`。
- `business_data`：把快照作为请求字段发送。

两种方式使用相同快照结构，数据结构为：

```json
{
  "schemaVersion": "1",
  "interaction": {
    "surface": "chat",
    "action": "message_submit"
  },
  "profileSnapshot": {
    "available": true,
    "version": 1,
    "data": {}
  },
  "historySnapshot": {
    "available": true,
    "through": "ISO-8601",
    "data": {}
  },
  "simulationState": null,
  "permissions": {
    "candidateCreationAllowed": true,
    "officialWritesAllowed": false
  }
}
```

快照由 `src/lib/chat/agentic-v2-snapshot.ts` 生成，包含字段白名单、文本截断、数组数量限制和总字节限制。普通敏感度以外的记忆不会进入 V2 上下文。

## 三、V2 输出契约

V2 需要写入业务数据时，在可读正文末尾输出恰好一个：

```text
<CAREERMATE_ARTIFACT>
{完整 AgentArtifactV1 JSON}
</CAREERMATE_ARTIFACT>
```

公共外壳由 `src/lib/agentic-v2/contracts.ts` 定义：

```text
schemaVersion: "1.0"
taskType: profile_assessment | career_exploration | career_plan |
          learning_route | simulation_turn | simulation_report |
          resume_review | growth_review | memory_item |
          career_template_draft
status: success | needs_input | pending_confirmation | error
summary: string
data: taskType 对应的严格业务 Schema
evidence: JSON array
sources: JSON array
assumptions: JSON array
warnings: JSON array
requiresUserConfirmation: boolean
baseVersion: number | null
nextActions: JSON array
```

服务端只接受通过 `validatedAgentArtifactV1Schema` 的结果。只有以下条件全部满足时才创建候选：

- `status=pending_confirmation`。
- `requiresUserConfirmation=true`。
- taskType 与 candidateType 兼容。
- data 通过对应业务 Schema。
- 版本字段满足当前画像或计划版本。
- source conversation 属于当前用户。

无标签 JSON、多个 envelope、损坏 JSON 或 Schema 不匹配只能作为普通文本/警告处理，不得写入正式数据。

### career_plan 精确契约

聊天路径要求 Agent 在正文末尾输出 `taskType=career_plan` 的精确标签信封：

```text
data.plan = AiCareerPlanV2
```

`data` 顶层只能有 `plan` 字段，不允许把计划字段直接放在 `data` 顶层。Plan V2 必须包含 `schemaVersion=2`、`title`、`targetRole`、`summary`、`horizon`、`phases`、`immediateActions`、`assumptions`、`riskNotes`、`evidenceRefs`；`phases` 内与 `immediateActions` 的 `action.id` 必须全局唯一。

`baseVersion` 使用 `historySnapshot.data.activePlan.version`；没有 active plan 时填 `0`。`status=pending_confirmation`，`requiresUserConfirmation=true`，后端只创建待确认候选，不直接改写正式计划。

## 四、旧 AgentResponse 路径

`src/lib/chat/agent-protocol.ts` 中的 `AgentResponse` 是旧的 terminal structured 协议，主要用于基础 TBox 路径的兼容 operations：

- `profile_patch`
- `memory_proposal`
- `plan_draft`
- `exploration_report`

该路径只有在以下条件满足时才执行 operations：

- `TBOX_STRUCTURED_MODE=terminal`。
- `AGENT_OPERATIONS_V1=true`。
- 当前响应不是降级结果。
- 当前上下文 scope 允许业务操作。

两个开关默认关闭。Agentic V2 不依赖 AgentResponse，而使用 ArtifactV1 候选协议。

## 五、角色身份

代码支持任意职业：

- 已知种子别名解析为稳定岗位 key。
- 未知职业生成 `custom_<sha256 前 12 位>` key。
- `RoleTemplate.aliases` 可以通过数据库扩展别名。

已知种子岗位仅是模板和演示数据，不是输入白名单。

## 六、来源和降级

来源标签必须基于实际证据：

- 已核验职业库：存在真实知识库检索证据。
- 实时联网调研：存在真实搜索工具调用和 citation。
- AI 分析与推断：无法绑定外部来源时使用。

TBox 基础模式的降级顺序：

```text
api → manual → mock
```

每次结果都要保留 requested mode、actual mode、degraded、fallbackReason 和 source，界面应明确展示降级状态。
