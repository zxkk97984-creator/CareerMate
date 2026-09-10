# 模拟训练进入独立聊天

`/simulation` 提供推荐场景、自定义生成、预览抽屉和最近训练。预览后创建训练及独立聊天，跳转 `/chat?conversationId=…`。聊天顶部提供场景详情、有效回答轮次、结束评分和再次训练。结束后仍可讨论报告，后续聊天不推进训练轮次。

数据库迁移 `20260911020000_simulation_chat` 增加可选的一对一聊天关联和创建请求幂等键；保留原训练记录。旧训练通过 `POST /api/simulations/:sessionId/conversation` 恢复，导入已有问答和报告。聊天软删除后，从训练大厅恢复同一条对话，不删除训练。

`POST /api/simulations` 新增可选 `createConversation` 和 `requestId`，响应增加 `conversationId`。聊天详情增加 `simulation`；训练详情 GET 仅允许所属用户读取。训练发送使用共享模拟服务，通过聊天 SSE 输出已校验的追问，心跳覆盖模型等待时间；回答与评分互斥。API 追问失败不增加有效轮次。普通聊天继续使用原流式服务；已完成训练以报告及历史作为讨论上下文。

验证：SQLite 集成覆盖归属、恢复、创建幂等、旧请求重放、失败不计轮、报告唯一性与并发互斥。Playwright `e2e/simulation-chat.spec.ts` 在独立 E2E 数据库和 Mock AI 环境覆盖推荐/自定义、桌面/移动端、预览关闭、三轮训练、刷新、结束报告和后续讨论。真实百宝箱模型的追问与评分质量需单独联调，不以 Mock 测试替代。

本地开发数据库迁移前已备份到 `/tmp/careermate-before-training-chat-20260911015053.db`。此次没有调整百宝箱发布版本或模型配置。
