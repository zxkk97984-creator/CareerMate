# 百宝箱工作流配置

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
