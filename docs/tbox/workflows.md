# 百宝箱工作流配置

> 更新日期：2026-07-14
> 主 Agent 统一编排入口：`agent_id` 由服务端环境变量 `TBOX_AGENT_ID` 指定，不再分别调用子工作流 ID。
> 子工作流由主 Agent 在平台侧内部选择，Next.js 不传子工作流 ID。

## 0. 结构化输出协议（7 类能力）

主 Agent 结束节点通过 `variables.result` 返回以下七类结构化 envelope 之一。`type` 字段必须与下表完全一致。

| 能力 | `resultType` | 关键字段 | Zod Schema |
|------|-------------|---------|------------|
| 技能评估 | `profile_assessment` | `targetRole`, `scores`(6维), `strengths`, `gaps`, `evidence`, `assumptions`, `needsConfirmation: true`, `candidateUpdates` | `profileAssessmentSchema` |
| 画像匹配 | `role_match` | `matches[3]`: `role`, `score`, `reasons`, `gaps`, `assumptions` | `roleMatchResultSchema` |
| 职业计划 | `career_plan` | `plan`(复用 `careerPlanSchema`), `candidateUpdates` | `careerPlanResultSchema` |
| 学习路线 | `learning_route` | `targetRole`, `weeklyHours`, `phases[]`: 阶段/周任务/资源/风险 | `learningRouteResultSchema` |
| 模拟训练(轮) | `simulation_turn` | `scenarioKey`, `assistantMessage`, `turnIndex`, `shouldComplete` | `simulationTurnResultSchema` |
| 模拟训练(报告) | `simulation_report` | `scenarioKey`, `score`, `strengths`, `improvements`, `evidence`, `abilityImpact`, `candidateUpdates` | `simulationReportResultSchema` |
| 简历优化 | `resume_review` | `summary`, `issues[]`, `suggestions[]`, `rewrites[]`, `fabricatedFacts: false` | `resumeReviewResultSchema` |

**直接回复节点**只输出用户可见 Markdown，不得包含结构化 JSON。
**结束节点**只返回变量消息 `result`（使用对应能力 envelope），不得再次输出与直接回复相同的用户可见文本。

## 一、职业探索工作流

**触发条件：** 用户询问职业信息、比较职业、确定目标

**流程：**
1. 判断职业是否在 `supportedRoleKeys`（ai_product_manager, data_analyst, aigc_operator）
2. 已核验职业 → 调用知识库 `roleCompetency`
3. 未知职业 → 调用 `search_engine` 联网搜索
4. 结果通过 `explorationReportSchema` Zod 校验
5. 展示来源标签（已核验职业库 / 实时联网调研 / AI分析与推断）

## 二、画像候选工作流

**触发条件：** AI 从对话中发现新的用户画像信息

**输出约束：**
- 仅允许 `ALLOWED_CANDIDATE_FIELDS` 白名单字段
- 每个候选必须包含：原文依据 (evidenceExcerpt)、置信度 (confidence)、计划影响 (impactSummary)
- 能力候选同时创建 `AbilityEvidence(status=pending)`
- 能力分限定 0–100

## 三、新职业调研工作流

**触发条件：** 用户询问非内置职业

**流程：**
1. 调用 `search_engine` 搜索
2. 搜索优先级：政府/职业标准 → 行业协会 → 企业官方岗位 → 研究报告
3. 输出 `ExplorationReport` 结构
4. 关键事实必须有非推断来源
5. fitAnalysis 必须标注 "AI推断"

## 四、计划生成/重规划工作流

**触发条件：** 用户请求制定或更新职业计划

**输出约束：**
- 统一计划结构：3年方向 + 12个月里程碑 + 90天任务 + 本周行动
- 重规划：生成新版本候选 + 差异对象
- 不直接确认——用户确认后才激活

## 五、模拟训练工作流

**触发条件：** 用户请求模拟面试、沟通等场景

**流程：**
1. 选择场景（面试/沟通/汇报/协作）
2. 逐轮反馈
3. 结构化总结（分数 + 改进建议）
