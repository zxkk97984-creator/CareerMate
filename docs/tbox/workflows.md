# CareerMate AI 工作流当前边界

本文只描述代码当前可以承接的业务任务和输出边界。页面不会传递“调用某个工作流”的实现指令；页面只发送自然语言和受限的 `interaction.surface/action`。

## 1. 运行入口

产品聊天主链路：

```text
主聊天 / 工作台助手
→ /api/chat/conversations/:id/stream
→ 普通聊天 stream-service / 关联训练 messages-service
→ TBox 适配器或 Agentic V2
```

页面专用 API 仍负责确定性业务状态：画像确认、计划任务状态、模拟会话、记忆决策和管理员审核。

## 2. Agentic V2 任务类型

V2 ArtifactV1 支持以下 `taskType`：

```text
profile_assessment
career_exploration
career_plan
learning_route
simulation_turn
simulation_report
simulation_scenario
resume_review
growth_review
memory_item
career_template_draft
```

只有需要用户确认的结果才会进入候选生命周期：

```text
Agent artifact
→ 精确 envelope 解析
→ AgentArtifactV1 校验
→ candidateType / data Schema 校验
→ pending 候选
→ 用户接受或拒绝
→ 版本检查
→ 事务化投影
```

## 3. 画像评估和画像候选

触发条件：用户在对话中明确表达阶段、专业、目标岗位、时间、偏好、经历或限制。

约束：

- 只允许 `UserProfile` 字段白名单。
- 推断信息必须包含证据、置信度和原因。
- 画像版本发生变化时，旧候选接受操作返回版本冲突。
- 正式画像只能在用户确认后更新。

画像引导的确定性实现位于：

- `src/lib/onboarding.ts`
- `src/app/api/onboarding/chat/route.ts`
- `src/app/api/onboarding/complete/route.ts`

## 4. 职业探索

代码支持已知岗位模板和未知岗位：

- 已知岗位可读取 `RoleTemplate` 和本地知识素材。
- 未知岗位通过稳定 custom role key 表示，不会因为一次回答自动写入正式岗位模板。
- 需要市场变化、薪资或当前招聘信息时，必须标记为实时核验或 AI 推断。
- 探索报告保存到 `CareerExplorationReport`，必要时生成 `career_template_draft` 候选。

## 5. 职业计划与学习路线

当前同时兼容两种计划结构：

- V1：历史固定 3 年、12 个季度和 36 个月数组。
- V2：`horizon`、`phases`、`actions` 的灵活结构。

V2 结构由 `src/lib/plans/schema-v2.ts` 校验，全局 action ID 必须唯一。`PLAN_V2_WRITE=false` 时可以读取/转换 V2，但不会创建新的 V2 正式计划。

所有新计划先进入 `pending`，由用户确认后再成为 `active`。计划任务状态由本地 API 校验并写入，不依赖 AI 直接修改数据库。

学习路线是独立的 `LearningRoute` 版本化模型，不能把 `CareerPlan` 的读取或接受当作学习路线写入。

## 6. 模拟训练

当前训练由本地 `SimulationSession` 管理，支持推荐场景、自定义场景和岗位样本三类来源：

1. 先预览并允许编辑；点击开始后保存 `scenarioSnapshot`、`scoringSnapshot`、来源和轮次上限。
2. 创建独立 ChatConversation 并进入主聊天；训练与聊天通过持久化关联恢复，默认最多 6 轮回答。
3. 至少 3 轮后才允许完成评分。
4. 生成结构化报告。
5. 保存分数、优势、改进项和能力影响。
6. 非降级报告可以创建 `ability_evidence` 候选。完成后同一对话用于报告讨论，不再推进训练轮次。

`simulation_turn` 是逐轮协议，不会直接创建候选；`simulation_scenario` 只读预览；`simulation_report` 在完成接口中单独校验。报告保存与能力证据确认是两步。

## 7. 记忆

记忆写入受 `UserProfile.memoryEnabled` 控制：

- 用户明确要求记住且置信度足够高的普通记忆可以自动确认。
- Agent 提议的普通记忆进入 pending。
- 敏感记忆进入 pending，不自动确认。
- 关闭长期记忆时不写入新记忆，但已有记忆不被自动删除。

V2 snapshot 只读取已确认、职业作用域、普通敏感度且未过期的记忆。

## 8. 工作流和平台资源的边界

平台侧工作流、知识库、Skill 和子智能体的真实发布状态不由仓库代码保证。代码只保证：

- TBox 请求参数和超时处理。
- SSE 事件归一化。
- 结构化结果的本地 Schema 校验。
- 候选、版本、权限和事务投影。

因此文档中的资源名称只能作为职责分类，不能替代百宝箱控制台中的真实资源引用和版本核验。

## 9. 资源中心与岗位样本

- 学习资源由 `ResourceItem` 增量导入，必须带可追溯 URL 或完整实践说明；详情接口不返回无操作占位。
- 岗位样本由 `JobSample` 按 `jobId` 合并 56 个本地 CSV，保留来源文件、导入批次和字段冲突；招聘者姓名、活跃状态和联系方式不进入应用模型上下文。
- 岗位样本只用于本地分析和演示，不新增爬虫或公开招聘服务；薪资单位不混算，采集日期未知时保持未知。
- 平台工作流通过 `evidence_bundle_json.jobSample` 消费脱敏后的单个岗位，不接收原始 CSV 全包。
