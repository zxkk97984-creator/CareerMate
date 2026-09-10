# 文档导航

当前维护日期：2026-09-11。

| 文档 | 用途 |
|---|---|
| [项目 README](../README.md) | 功能、启动、命令与运行模式 |
| [技术架构](architecture.md) | 页面、服务、数据流、独立训练聊天及安全边界 |
| [API 说明](接口设计文档.md) | 接口分组与关键请求行为 |
| [百宝箱实施指南](tbox/百宝箱优化实施指南.md) | 平台配置、粘贴包、工作流绑定和发布验证 |
| [主 Agent](tbox/main-agent.md)、[工作流](tbox/workflows.md)、[知识库](tbox/knowledge-bases.md) | 平台配置参考；执行内容以 src/agentic-v2 为准 |
| [模拟聊天验收](acceptance/simulation-chat-2026-09-11/README.md) | 实现边界、迁移和可复现测试 |
| [清理记录](cleanup-2026-09-11.md) | 废弃代码、依赖及历史产物清理范围 |

`产品需求文档_PRD.md`、`AI职业导航项目方案.md` 描述产品需求与初始方案，不保证全部已实现。`tbox/百宝箱架构与运行现状-2026-09-09.md`、`tbox/acceptance-evidence.md` 是带日期的历史证据，不能代替当前源码或平台日志。`evaluation/` 和 `src/agentic-v2/evaluation/` 保留可执行/可复核的评测资料。

不在仓库维护一次性任务清单、旧设计执行步骤、PPT 构建目录和临时截图。当前架构统一维护在 `architecture.md`，不要复制另一份长期维护的架构正文。
