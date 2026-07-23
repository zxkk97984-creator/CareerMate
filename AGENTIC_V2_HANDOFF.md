# CareerMate Agentic V2 架构交接

本文说明仓库当前的 Agentic V2 运行链路、百宝箱资源边界、结构化候选协议和发布检查项。它以实际代码为准，不依赖机器路径、个人账户或特定开发环境。

## 1. 当前运行链路

CareerMate 当前采用“单一 AI 大脑 + 业务后端治理”的架构：

```text
用户
→ CareerMate 前端
→ CareerMate 后端 /api/chat
→ 脱敏 profileSnapshot / historySnapshot / simulationState
→ 一个已发布的百宝箱 Agentic V2 agent_id
→ 知识库、工作流、Skill、专业子智能体、夸克搜索与平台记忆
→ 可读答复 + 可选 CAREERMATE_ARTIFACT
→ 后端校验并创建待确认候选
→ 用户接受或拒绝
→ CareerMate 权威数据库
```

运行约束：

- 百宝箱 Agentic 是唯一 AI 决策中枢，CareerMate 后端不维护第二套路由模型。
- 所有页面统一经过 `/api/chat`，页面只描述用户动作和当前界面，不命令 Agent 调用具体工具。
- 后端只调用一个 V2 `agent_id`，同一会话复用已绑定的百宝箱 `conversation_id`。
- 当前真实链路使用脱敏快照，不使用上下文签名令牌访问业务 MCP。
- 当前请求关闭百宝箱内置搜索，由 Agent 已挂载的夸克搜索 MCP 统一提供联网能力。
- Mock 模式保留，用于无平台凭据时的本地开发和确定性回归测试。

关键实现：

- `src/lib/chat/agentic-v2-snapshot.ts`
- `src/lib/chat/agentic-v2-context.ts`
- `src/lib/chat/stream-service.ts`
- `src/lib/tbox/client.ts`
- `src/lib/agentic-v2/artifact-envelope.ts`
- `src/lib/agentic-v2/candidate-ingestion.ts`
- `src/lib/agentic-v2/candidate-resolution.ts`

## 2. 职责边界

### 百宝箱 Agentic V2

负责：

- 理解用户自然语言目标。
- 判断是否需要当前市场信息。
- 选择知识库、工作流、Skill、搜索 MCP 或专业子智能体。
- 融合个人事实、历史记录、职业基线和市场证据。
- 生成正常可读答复。
- 在需要保存时生成结构化候选。

不得：

- 伪造用户经历、证书、项目或训练记录。
- 将市场结论写成用户事实。
- 将用户历史写成行业规律。
- 直接覆盖正式画像、分数、计划、进度或记忆。
- 将完整简历、联系方式或无关敏感信息放入联网搜索。

### CareerMate 后端

负责：

- 登录态、用户所有权和跨用户隔离。
- 从数据库生成最小必要的脱敏快照。
- 管理本地会话与远端 `conversation_id` 绑定。
- 解析精确信封并执行严格 Schema 校验。
- 创建待确认候选。
- 校验用户所有权、权限、候选状态和 `baseVersion`。
- 在用户明确接受后事务化投影正式数据。

不得：

- 根据页面名称硬编码 Agent 的工具选择。
- 将无标签或无效 JSON 当作可写业务对象。
- 把 Mock 或降级结果伪装成实时平台结果。

### CareerMate 前端

负责：

- 采集用户请求。
- 发送页面 `surface`、`action` 和可选目标引用。
- 展示 SSE 流式结果、来源和候选卡片。
- 收集用户明确的接受或拒绝决定。

前端页面上下文是观察信息，不是实现命令。例如应表达“用户在职业路径页请求重新规划”，而不是表达“调用 V2职业规划工作流”。

### CareerMate 数据库

数据库是以下数据的权威来源：

- 已确认职业画像及版本。
- 已确认能力证据和分数。
- 活跃与历史职业计划。
- 成长进度与实际完成记录。
- 模拟训练会话和原始回答。
- 用户确认的正式记忆。
- 待确认候选和处理结果。

## 3. 当前请求与响应契约

### 3.1 前端到 CareerMate 后端

所有页面使用统一聊天入口。除自然语言消息外，可提供页面上下文：

```json
{
  "message": "根据我的最新情况调整职业规划",
  "interaction": {
    "surface": "career_path",
    "action": "regenerate_plan",
    "targetRef": "optional-local-reference"
  }
}
```

`interaction` 不能覆盖用户消息，也不能携带 `call_workflow_*` 一类实现指令。

### 3.2 CareerMate 后端到百宝箱

开启 Agentic V2 后，后端构造 `business_data`：

```json
{
  "schemaVersion": "1",
  "interaction": {
    "surface": "career_path",
    "action": "regenerate_plan"
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

代码中的关键限制：

- 快照只读取当前登录用户的数据。
- 仅发送产品任务所需字段，并对文本、数组数量和总字节数设限。
- 能力证据只包含已确认记录。
- 正式记忆只有在用户开启记忆后，才包含正常敏感度、职业作用域、已确认且未过期的数据。
- 模拟状态只在当前页面提供有效会话引用时加载。
- `permissions.officialWritesAllowed` 固定为 `false`。
- `search_engine` 在 Agentic V2 路径固定关闭。

真实 API 环境建议：

```env
TBOX_MODE="api"
TBOX_API_KEY="<tbox-api-key>"
TBOX_AGENT_ID="<tbox-agent-id>"
TBOX_AGENT_VERSION="<validated-agent-version>"
CAREERMATE_AGENTIC_V2="true"
TBOX_CONTEXT_TRANSPORT="business_data"
TBOX_HISTORY_MODE="provider"
STATEFUL_CHAT_TURNS="true"
TBOX_SEARCH_ENGINE="false"
```

密钥和真实平台标识只能存放在未提交的服务端环境变量中。

### 3.3 百宝箱到 CareerMate 后端

普通回答可以只包含 Markdown 文本。需要创建候选时，答复末尾必须恰好包含一个精确信封：

```text
<CAREERMATE_ARTIFACT>
{...一个完整且有效的 AgentArtifactV1 对象...}
</CAREERMATE_ARTIFACT>
```

`AgentArtifactV1` 的公共外壳定义在 `src/lib/agentic-v2/contracts.ts`。允许的任务类型包括：

```text
profile_assessment
career_exploration
career_plan
learning_route
simulation_turn
simulation_report
resume_review
growth_review
memory_item
career_template_draft
```

允许的状态：

```text
success
needs_input
pending_confirmation
error
```

严格规则：

- 只识别精确的起止标签。
- 不从无标签 JSON 或 Markdown 代码围栏猜测候选。
- 多个信封、缺失闭合标签、超限内容、无效 JSON 或无效 Schema全部拒绝。
- 可见正文与 artifact 分离保存。
- 只有 `pending_confirmation` 且 `requiresUserConfirmation=true` 的兼容任务才创建候选。
- `simulation_turn` 不创建正式候选。

## 4. 百宝箱 V2 资源拓扑

下面是 V2 的目标资源拓扑和仓库内配套素材。平台的实际名称、引用绑定、发布状态和版本必须在每次发布前单独核验；本文不把未核验的草稿描述成已发布资源。

### 4.1 主智能体

```text
CareerMate职业成长伙伴V2
类型：Agentic 自主规划
```

主智能体承担唯一认知与调度职责，不再增加重复的“成长战略规划师”认知层。

### 4.2 知识库

```text
V2职业能力模板库
V2学习资源库
V2训练场景库
V2伦理隐私规则库
V2职业趋势研究库
V2简历作品方法库
V2认证机会库
```

仓库素材位于 `src/agentic-v2/knowledge-bases/`。

用途边界：

- 职业能力、证据锚点和长期路径基线来自职业能力模板库。
- 课程、练习、项目和机会需要结合资源有效期和当前联网核验。
- 趋势研究库是带时间和来源的稳定研究材料，不能冒充实时市场。
- 未知职业先形成研究报告和模板草稿，不能直接写入正式职业注册表。
- 深度支持的已知职业也必须结合个人画像、历史记录和当前市场，不能仅套用模板。

### 4.3 工作流

```text
V2画像评估
V2职业探索
V2职业规划
V2学习路线
V2职场模拟
V2简历作品
V2成长复盘
```

平台配置稿位于 `src/agentic-v2/platform/workflows/`。

工作流负责步骤稳定、输出结构明确的任务。结束节点应返回结构化变量，不应同时由“直接回复”、结束节点和主 Agent 重复输出同一正文。

### 4.4 Skill

```text
CareerMate职业证据解析
CareerMate成长数据分析
```

源码位于：

- `src/agentic-v2/skills/evidence-parser/`
- `src/agentic-v2/skills/growth-analyzer/`

Skill 只进行文件解析、事实与推断分离、敏感字段识别、数据计算和标准化，不负责联网，也不写正式业务数据。

### 4.5 专业子智能体

```text
CareerMate职业情报研究员V2
CareerMate伦理证据审查员V2
```

职责：

- 职业情报研究员处理未知职业、多职业比较、地区/经验差异和多来源交叉核验。
- 伦理证据审查员检查证据充分性、来源时效、偏见、隐私、过度承诺和确认要求。

第一版不配置重复的成长战略规划师或模拟教练子智能体。只有评测证明主 Agent 或模拟工作流无法满足需求时才增加。

### 4.6 联网 MCP

```text
夸克搜索
```

联网原则：

- Agent 自主判断是否联网，并默认偏向核验会变化的现实职业信息。
- 简单实时事实由主 Agent 直接搜索。
- 多职业、未知职业、地区差异或多来源研究委派职业情报研究员。
- 搜索词不得包含私人画像原文、联系方式或完整简历。
- 搜索失败必须说明无法核验，不得伪造“当前市场”数据。

当前聊天路径不依赖 `CareerMate业务MCP V2`。

### 4.7 平台资源引用

在人设和指令中，应通过百宝箱编辑器选择已挂载资源，让界面生成真实资源引用芯片。不要仅手写同名普通文字，也不要在仓库文档中硬编码编辑器内部生成的资源标记。

## 5. 候选确认生命周期

候选主流程：

```text
Agent 生成 artifact
→ 精确标签解析
→ AgentArtifactV1 校验
→ 任务类型到候选类型的确定性映射
→ 以当前用户、会话和幂等键创建 pending 候选
→ 前端展示候选卡片
→ 用户接受或拒绝
→ 再次校验所有权、状态、任务兼容性、业务 Schema 和 baseVersion
→ 事务化投影或保持原数据
```

支持的候选类型：

```text
profile_patch
ability_evidence
career_plan
learning_route
growth_replan
memory_item
career_template_draft
```

安全机制：

- 候选查询和决策均绑定当前登录用户。
- 重复同一决定保持幂等；相反决定返回冲突。
- 画像和计划类候选使用 `baseVersion` 防止覆盖新版本。
- 正式投影前按候选类型执行更严格的数据 Schema。
- 正式投影在数据库事务中完成。
- `learning_route` 当前可被确认，但不直接投影为正式任务。
- 任何解析或摄入失败都不阻断可读正文，但不会产生正式数据。

候选接口：

- `src/app/api/agentic-v2/candidates/[candidateId]/route.ts`
- `src/app/api/agentic-v2/candidates/[candidateId]/decision/route.ts`

## 6. 长期记忆边界

CareerMate 使用三层上下文：

1. 本地聊天消息和远端 `conversation_id`：维持当前对话连续性。
2. 百宝箱自动长期记忆：保存低敏感度且长期有用的偏好。
3. CareerMate 数据库：保存用户已确认的权威业务状态。

允许平台自动记忆的典型内容：

```text
明确的职业方向
每周可投入时间
稳定学习偏好
回复风格偏好
用户主动要求记住的低敏感度约束
```

不应自动记忆：

```text
模型推断的性格
未经确认的能力弱项和分数
一次性情绪
完整简历
联系方式和身份信息
健康、财务和家庭敏感信息
正式职业计划全文
```

数据优先级：

```text
系统安全规则
> 用户当前明确要求
> CareerMate 已确认正式数据
> 百宝箱长期记忆
> 模型推断
```

CareerMate 记忆写入仍遵循 artifact 候选和用户确认流程。平台记忆不能覆盖数据库正式状态。

## 7. 保留的未来基础设施

仓库保留了可供后续启用的业务 MCP 与签名上下文令牌实现：

- `src/app/api/mcp/v2/route.ts`
- `src/lib/agent-context-auth.ts`
- `src/agentic-v2/deploy/`

相关环境变量包括：

```text
CAREERMATE_PLUGIN_TOKEN
CAREERMATE_CONTEXT_TOKEN_SECRET
CAREERMATE_MCP_ALLOWED_ORIGINS
```

这些代码当前是休眠基础设施：

- 不属于 Agentic V2 聊天主链路。
- 不需要为了运行当前 V2 聊天而部署公网 MCP。
- 不应在主 Agent 提示词中假装其已连接。
- 只有完成公网 HTTPS、平台协议兼容、短时令牌、Scope、跨用户隔离和故障降级测试后，才能作为新的架构变更启用。

启用它将改变信任边界，必须单独设计、评审和发布，不能仅通过打开环境变量完成。

## 8. 本地验证与发布清单

### 8.1 本地质量门禁

```bash
npm.cmd run secret:scan
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:migrations
npm.cmd run build
```

也可以执行：

```bash
npm.cmd run verify
```

### 8.2 百宝箱资源检查

- 主应用类型确认为 Agentic 自主规划。
- 实际挂载资源与本节拓扑一致。
- 人设中的资源均为编辑器生成的真实绑定引用。
- 工作流引用的是已验证版本，不存在待升级的旧引用。
- 子工作流只返回一个最终 artifact，不产生重复正文。
- 夸克搜索已启用，内置 `search_engine` 保持关闭。
- 平台自动长期记忆遵守低敏感度边界。
- 原生百宝箱 Web 在没有 CareerMate 登录态时不声称读取私人数据。

### 8.3 契约与安全检查

- 同一职业、不同画像生成不同建议。
- 已知职业同时使用个人画像、历史记录、知识库和当前市场证据。
- 未知职业触发职业情报研究，不要求修改主 Prompt。
- 搜索失败时明确说明时效限制。
- artifact 只有一个精确信封，字段满足 `AgentArtifactV1`。
- 未确认时正式数据库不变化。
- `baseVersion` 冲突时拒绝覆盖。
- 模拟训练复用会话和本地 `SimulationSession`，不重复开场问题。
- 不同用户的快照、候选和正式数据完全隔离。
- 简历原文和敏感字段不进入搜索查询。

### 8.4 发布顺序

```text
核验知识库
→ 核验 Skill
→ 核验子智能体
→ 核验工作流
→ 核验主 Agent 资源绑定
→ 运行平台评测
→ 发布并固定 agent_version
→ 在 CareerMate 测试环境设置 V2 agent_id
→ 端到端验收
→ 再决定是否切换正式环境
```

回滚只需恢复上一组已验证的 `agent_id` 和 `agent_version`，无需删除 V2 资源。
