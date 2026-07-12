# 百宝箱验收证据

> 验收日期：2026-07-12
> 环境：`TBOX_MODE=api`，真实百宝箱 API 凭证
> 测试账号：`student_lin`（画像：小林，目标 AI 产品经理，每周 6 小时）

## 验收清单

| # | 场景 | 输入 | 预期意图 | 预期工具/知识库 | 实际结果 | 降级 |
|---|------|------|----------|-----------------|----------|------|
| 1 | 已核验职业能力查询 | "AI产品经理需要哪些核心能力？" | roleCompetency | 职业知识库 | ✅ 188 delta 流式回答，含画像和计划上下文 | 无 |
| 2 | 学习资源推荐 | "推荐一些AI产品经理的入门课程" | learningResources | 学习资源库 | ✅ 166 delta 流式回答 | 无 |
| 3 | 模拟面试 | "陪我练一次跨岗位沟通模拟" | simulationScenes | 训练场景库 | ✅ intent=simulationScenes，knowledgeSources=["simulation-scenes"] | 无 |
| 4 | 隐私查询 | "我的个人数据如何删除？" | ethicsRules | 伦理规则库 | ✅ intent=ethicsRules，knowledgeSources=["ethics-and-privacy-rules"] | 无 |
| 5 | 未知职业调研 | "用户研究员这个岗位发展前景如何？" | roleResearch | search_engine | ✅ 2 个 artifact 事件（探索报告 + 引用来源），139 delta | 无 |

## 真实模式证据

- ✅ `actualMode=api` 且 `degraded=false`（5/5 场景全部满足）
- ✅ 多轮对话延续：`remoteConversationId` 非空（如 `20260712SQPD25764921`），第二轮请求携带上一轮的 conversationId
- ✅ 知识库检索命中：场景 3 `knowledgeSources=["simulation-scenes"]`，场景 4 `knowledgeSources=["ethics-and-privacy-rules"]`
- ✅ 未知职业 artifact 生成：场景 5 触发 2 个 `event: artifact`（`exploration_report_ref` + `citations`）

## 额外验证

- ✅ 画像候选自动生成：输入"我每周可以投入20小时学习"触发 `profile_candidate_ref` artifact
- ✅ 计划生成异步化：输入"帮我制定3个月学习计划"立即返回"正在生成中"占位卡片，不阻塞 SSE 流
- ✅ 多轮 remoteConversationId 延续：连续 3 轮对话均使用同一 `remoteConversationId`
- ✅ 326 单元测试 + 17 E2E 全部通过
