# Agentic V2 维护入口

更新：2026-09-11。先阅读 [README](README.md)、[技术架构](docs/architecture.md) 和 [API 说明](docs/接口设计文档.md)。平台操作见 [实施指南](docs/tbox/百宝箱优化实施指南.md)，可粘贴内容由 `npm run tbox:bundle` 从 `src/agentic-v2` 与当前后端契约生成。

关键源码：聊天 `src/lib/chat/stream-service.ts`、快照 `src/lib/chat/agentic-v2-snapshot.ts`、候选 `src/lib/agentic-v2/candidate-*`、模拟训练 `src/lib/simulation/`。

本地后端负责身份、所有权、版本、训练状态和正式投影；平台负责 AI 决策。V2 的正文和结构化结果分开处理，候选必须校验并由用户确认。平台记忆不是本地 MemoryItem。独立模拟训练与 ChatConversation 关联，结束后的对话只讨论报告，不继续计轮。

`npm run verify` 验证源码，Playwright 验证 Mock 产品流程；真实百宝箱需另核对 API 渠道上架版本和运行日志。不要依据历史任务文档推断当前发布状态。
