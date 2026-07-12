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

## 额外验证

- ✅ 画像候选自动生成：输入"我每周可以投入20小时学习"触发 `profile_candidate_ref` artifact
- ✅ 计划生成可恢复：聊天先保存真实计划 ID 和生成状态，再由独立请求执行；失败可重试，刷新后状态保留
- ✅ 多轮 remoteConversationId 延续：连续 3 轮对话均使用同一 `remoteConversationId`
- 自动化测试数量以最新 `npm.cmd run verify` 和 `npm.cmd run test:e2e` 输出为准，不在文档中写死历史数字
