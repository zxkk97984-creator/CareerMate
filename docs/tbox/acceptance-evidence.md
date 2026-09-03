# 百宝箱验收证据

> 验收日期：2026-07-12
> 环境：`TBOX_MODE=api`，真实百宝箱 API 凭证
> 测试账号：`student_lin`（画像：小林，目标 AI 产品经理，每周 6 小时）

## 应用侧验收记录

以下结果是 2026-07-12 在应用侧观察到的执行摘要。它们可以证明 CareerMate 收到了百宝箱 API 响应，但仓库中没有保存平台运行详情截图或导出的工具调用日志，因此不能单独作为搜索、知识库或插件真实调用的最终比赛证据。

| # | 场景 | 输入 | 预期意图 | 预期工具/知识库 | 实际结果 | 降级 |
|---|------|------|----------|-----------------|----------|------|
| 1 | 已核验职业能力查询 | "AI产品经理需要哪些核心能力？" | roleCompetency | 职业知识库 | ✅ 188 delta 流式回答，含画像和计划上下文 | 无 |
| 2 | 学习资源推荐 | "推荐一些AI产品经理的入门课程" | learningResources | 学习资源库 | ✅ 166 delta 流式回答 | 无 |
| 3 | 模拟面试 | "陪我练一次跨岗位沟通模拟" | simulationScenes | 训练场景库 | 应用记录 intent 和 knowledgeSources | 无 |
| 4 | 隐私查询 | "我的个人数据如何删除？" | ethicsRules | 伦理规则库 | 应用记录 intent 和 knowledgeSources | 无 |
| 5 | 未知职业调研 | "用户研究员这个岗位发展前景如何？" | roleResearch | search_engine | 应用收到探索报告与引用 artifact | 无 |

## 已有可审计范围

- 应用保存 `actualMode`、`degraded`、`fallbackReason` 和 `remoteConversationId`。
- 应用可证明多轮请求延续、结构化 artifact 持久化和来源 schema 校验。
- `knowledgeSources` 来自检索接口返回项，可用于应用侧召回检查。
- `actualMode=api` 只证明调用了百宝箱 API，不等同于已经证明 `search_engine` 或某个插件被执行。

## 待补平台证据

- [ ] 百宝箱主智能体运行详情：请求时间、运行 ID、真实模式和完整成功状态。
- [ ] 四个知识库各至少一次平台命中记录或评测中心截图。
- [ ] `search_engine` 的工具调用记录，以及报告中对应 URL 和访问日期。
- [ ] `profile.candidate.create` 或旧 REST 兼容插件的一次真实调用记录。
- [ ] 标准 MCP `tools/list` 和 `tools/call` 的外部客户端调用记录。

## 2026-07-14 SSE 事件协议采集

使用主 Agent `202607APx4uo20054136`，问题："请用一句话介绍 CareerMate，并返回一个简单的 Markdown 列表。"

### 真实 SSE 事件序列（不含敏感内容）

| 序号 | 事件名 | data 字段 | 是否重复 | conversation_id 位置 |
|------|--------|-----------|----------|---------------------|
| 1 | `conversation.chat.created` | created_time, conversation_id, usage, chat_id, status | 否 | data.conversation_id |
| 2 | `conversation.chat.in_progress` | created_time, agent_id, conversation_id, usage, chat_id, status | 否 | data.conversation_id |
| 3-24 | `conversation.message.delta` | updated_time, role, content_type, conversation_id, message_id, type, content, chat_id | 是（22次delta） | data.conversation_id |
| 25 | `conversation.chat.completed` | created_time, agent_id, completed_time, conversation_id, usage, chat_id, status | 否 | data.conversation_id |
| 26 | `done` | `[DONE]`（纯文本） | 否 | 无（在 done 事件中不携带） |

### 关键发现

- **不存在 `conversation.message.completed` 事件**：文本在 `conversation.message.delta` 中逐段推送，最后由 `conversation.chat.completed` 终止
- 存在 `conversation.chat.created` 和 `conversation.chat.in_progress` 两个新事件类型（当前解析器未处理，但不影响正常流程）
- `done` 事件 data 为 `[DONE]` 纯文本（非 JSON）
- conversation_id 在 `conversation.chat.created` 中首次出现，后续所有 delta 和 completed 事件均携带

### 配置状态

- `TBOX_MODE`: api
- `TBOX_API_KEY`: PRESENT
- `TBOX_AGENT_ID`: PRESENT（202607APx4uo20054136）
- `TBOX_AGENT_VERSION`: ABSENT（未配置）

## 额外验证

- ✅ 画像候选自动生成：输入"我每周可以投入20小时学习"触发 `profile_candidate_ref` artifact
- ✅ 计划生成可恢复：聊天先保存真实计划 ID 和生成状态，再由独立请求执行；失败可重试，刷新后状态保留
- ✅ 多轮 remoteConversationId 延续：连续 3 轮对话均使用同一 `remoteConversationId`
- 自动化测试数量以最新 `npm.cmd run verify` 和 `npm.cmd run test:e2e` 输出为准，不在文档中写死历史数字

## 2026-07-15 开放聊天改造基线

> 基线提交：`76a8365`
> 分支：`Xiaoxiao/careermate-p0-init`
> 工作树状态：仅 `docs/tbox/2026-07-15-开放式主聊天与混合记忆实施计划.md` 未跟踪

### 本地自动化

```bat
npm.cmd run verify
```

- secret scan：通过（263 文件已检查）
- lint：通过（max-warnings=0）
- typecheck：通过（Next.js 16.2.10 + TS 5.9.2）
- 单元/集成测试：73 个文件、441 个测试全部通过（Vitest 3.2.6）
- 迁移冒烟测试：通过（fresh deploy/drift 和 legacy preservation/FKs）
- 生产构建：通过（Turbopack，40 个静态页面）

```bat
npm.cmd run test:e2e
```

- Playwright 1.61.1：34 个测试全部通过（chromium，58.8s）
- 覆盖：聊天首页、P0 流程、统一壳层

### 真实百宝箱能力缺口

- 真实百宝箱 history：**未验证**。当前请求未发送本地历史消息到百宝箱 `history` 字段。
- 真实百宝箱 business_data：**字段可发送但语义未验证**。`business_data` 字段存在于请求体中，但未验证百宝箱是否会读取并使用其中的画像信息。
- 真实百宝箱联网搜索/citation：**未验证**。当前 `TBOX_SEARCH_ENGINE` 默认为 false，未测试搜索工具调用和 citation 事件的真伪。
- 当前产品请求：**依赖 conversation_id 维持多轮上下文**，未发送本地 history/context 作为权威状态源。
- 结构化输出（variables.result）：**agent_response 结构未验证**。未知百宝箱是否能在同轮 SSE 流中同时返回正文和结构化 JSON。

## 2026-07-15 百宝箱契约探针（Phase 0 Task 2 v2）

> 提交：见 Task 2 最终 commit
> 探针运行时间：2026-07-15T13:08 UTC
> 运行方式：`npm run tbox:probe -- --yes`（确认门已通过）

### 新增/修改文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `scripts/tbox-chat-contract-probe.ts` | 重写 | 9 场景脱敏探针 v2（loadEnvConfig + 确认门 + 统一脱敏） |
| `src/lib/tbox/probe-judge.ts` | **新建** | 所有探针判据的纯函数模块 |
| `src/lib/tbox/probe-judge.test.ts` | **新建** | 74 个正向+负向单元测试 |
| `src/lib/tbox/client.ts` | 修改 | `SafeProbeResult` 接口和 `sanitizeProbeResult()` 函数 |
| `src/lib/tbox/types.ts` | 修改 | `TboxHistoryMode`、`TboxContextTransport`、`TboxStructuredMode` 类型 |
| `src/lib/env.ts` | 修改 | 3 个传输决策变量读取 + 默认值按探针结果调整 |
| `src/lib/env.test.ts` | 修改 | 11 个配置项测试 |
| `src/lib/tbox/client.test.ts` | 修改 | 5 个 SafeProbeResult 脱敏测试 |
| 5 个 tbox 测试文件 | 修改 | 补充 TboxConfig 新字段 |

### 真实探针结果（9 场景）

| # | 探针 | 结果 | 详情 |
|---|------|------|------|
| 1 | `basic_sse` | ✅ pass | 17 个 SSE 事件，含 conversation + text_delta + done，有正文 |
| 2 | `conversation_id` | ❌ fail | 首轮成功但后续轮次返回 5xx，无法验证多轮 ID 延续 |
| 3 | `history` | ✅ pass | Agent 仅通过 history 字段成功复述 `CM-HISTORY-731` |
| 4 | `business_data` | ❌ fail | Agent 未提及 DBA，business_data 中的画像信息未被读取 |
| 5 | `text_and_result` | ❌ fail | 仅有正文，无结构化 `variables.result` |
| 6 | `followup_structured` | ❌ fail | followup 请求也未返回结构化结果 |
| 7 | `search_and_citation` | ❌ fail | 返回 5xx 服务端错误（搜索可能未在平台配置） |
| 8 | `invalid_conversation` | ❌ fail | 错误形态不明确，无法提取 HTTP 状态码或错误码 |
| 9 | `context_size` | ✅ pass | 至少支持 16000 字符（已达探测上限，不写成平台上限） |

### 最终传输决策

```env
TBOX_HISTORY_MODE="provider"           # history 探针通过，百宝箱能读取 history 字段
TBOX_CONTEXT_TRANSPORT="question_prefix"  # business_data 探针失败，回退到用户不可见前缀
TBOX_STRUCTURED_MODE="terminal"        # 同轮和 followup 均失败，结构化能力标记 blocked
```

### 分支决策依据

- **history 通过** → `TBOX_HISTORY_MODE="provider"`（确认）
- **business_data 不通过** → `TBOX_CONTEXT_TRANSPORT="question_prefix"`，服务端使用用户不可见的上下文前缀，数据库仍只保存原始用户问题
- **两种结构方式都不通过** → 保留正文、零业务写入，结构化能力标记 blocked。`TBOX_STRUCTURED_MODE` 保持 `"terminal"` 不变

### 阻塞项

- **conversation_id 多轮**：首轮后 5xx 错误，需排查平台侧多轮会话配置
- **结构化输出**：百宝箱主 Agent 当前不返回 `variables.result`，结构化业务操作不可用
- **联网搜索**：`TBOX_SEARCH_ENGINE=true` 时返回 5xx，需确认平台是否已启用搜索插件
- **无效会话错误码**：异常被统一脱敏后无法提取精确 HTTP 状态码，`invalid_conversation` 探针需要更细粒度的错误信息提取
