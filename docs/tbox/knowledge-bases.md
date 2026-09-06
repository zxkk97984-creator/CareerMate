# CareerMate 知识库边界

代码中允许的 dataset key 定义在 `src/lib/tbox/types.ts` 和 `src/lib/tbox/retrieval.ts`。真实 dataset ID 只从服务端环境变量读取，仓库不把某个 ID 或发布状态视为已确认事实。

## 1. `roleCompetency`

环境变量：`TBOX_DATASET_ROLE_COMPETENCY`

用途：

- 岗位职责和核心能力。
- 入门要求与能力证据锚点。
- 岗位基线和学习方向。

## 2. `learningResources`

环境变量：`TBOX_DATASET_LEARNING_RESOURCES`

用途：

- 课程、练习和项目建议。
- 按岗位、能力和阶段检索学习资源。
- 为学习路线提供可核验的候选材料。

## 3. `simulationScenes`

环境变量：`TBOX_DATASET_SIMULATION_SCENES`

用途：

- 面试、沟通、汇报和协作场景。
- 场景目标、对手角色、追问和评分维度。

当前模拟训练的基础场景也在 `src/lib/simulation.ts` 中有本地确定性定义。

## 4. `ethicsRules`

环境变量：`TBOX_DATASET_ETHICS_RULES`

用途：

- 隐私和敏感数据边界。
- AI 推断与用户事实的区分。
- 候选确认、导出和删除相关规则。

## 5. `careerTrends`

环境变量：`TBOX_DATASET_CAREER_TRENDS`

用途：

- 行业趋势和岗位变化背景。
- 带时间、来源和范围的市场研究材料。

静态趋势材料不得标记为实时市场结论。薪资、招聘数量、政策和当前岗位需求等时效信息必须在允许联网时重新核验。

## 检索模式

`TBOX_RETRIEVAL_MODE` 支持：

- `agent`：由 Agent 自己决定是否使用知识库或联网能力。
- `hybrid`：CareerMate 先按职业意图做有限本地检索，再把结果交给基础 TBox 路径。

Agentic V2 路径使用脱敏 `business_data`，并关闭基础 `TBOX_SEARCH_ENGINE`；联网能力由已发布 Agent 的真实工具绑定决定。

## 代码约束

- dataset key 必须通过 `datasetKeySchema`。
- 未配置 dataset ID 时，检索接口应安全失败或返回本地可用结果，不能伪造知识库来源。
- 引用标签必须区分“已核验职业库”“实时联网调研”和“AI分析与推断”。
- 知识库内容不能绕过用户确认直接写入画像、计划、记忆或正式岗位模板。
