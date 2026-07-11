# 百宝箱验收证据

> 真实百宝箱 API 调用需用户配置 TBOX_API_KEY、TBOX_APP_ID、TBOX_AGENT_ID 后手动验收。

## 验收清单

| # | 场景 | 输入 | 预期意图 | 预期工具/知识库 | 实际结果 | 降级 |
|---|------|------|----------|-----------------|----------|------|
| 1 | 已核验职业能力查询 | "AI产品经理需要哪些核心能力？" | roleCompetency | 职业知识库 | — | — |
| 2 | 学习资源推荐 | "推荐数据分析入门课程" | learningResources | 学习资源库 | — | — |
| 3 | 模拟面试 | "模拟一次产品经理面试" | simulationScenes | 训练场景库 | — | — |
| 4 | 隐私查询 | "我的数据如何删除？" | ethicsRules | 伦理规则库 | — | — |
| 5 | 未知职业调研 | "用户研究员这个岗位发展前景如何？" | roleResearch | search_engine | — | — |

## 截图位置

- 截图保存至 `docs/tbox/screenshots/` 目录
- 每条证据包含：输入文本、AI回复截图、控制台网络请求截图

## 真实模式证据要求

- `TBOX_MODE=api`
- `actualMode=api` 且 `degraded=false`
- 至少一条：多轮对话延续（remoteConversationId 非空）
- 至少一条：知识库检索命中（knowledgeSources 非空）
- 至少一条：未知职业联网搜索（sourceLabel = "实时联网调研"）
