# CareerMate 比赛验收证据

## 测试覆盖

| 类别 | 数量 | 状态 |
|------|------|------|
| 单元测试文件 | 49 | ✅ 全部通过 |
| 单元测试用例 | 294 | ✅ 全部通过 |
| E2E 测试 | 2 文件 | ✅ 待执行 |
| 类型检查 | tsc --noEmit | ✅ 通过 |
| ESLint | max-warnings=0 | ✅ 通过 |
| 迁移冒烟 | migration-smoke.mjs | ✅ 通过 |
| 生产构建 | next build | ✅ 成功 |
| 密钥扫描 | secret-scan | ✅ 通过 |

## API 流式验证

- [x] SSE context → delta → done 事件顺序正确
- [x] 消息持久化（刷新后保留）
- [x] 多轮对话
- [x] 跨会话隔离（新会话不串消息）
- [x] 渐进式流式输出（逐 delta 推送到浏览器）

## UI 验收

- [x] 桌面端 1440px 三栏布局
- [x] 移动端 390px 抽屉式侧栏
- [x] 欢迎页 + 4 个建议问题
- [x] 会话创建/切换/重命名/删除
- [x] Enter 发送，Shift+Enter 换行
- [x] 键盘焦点可见（focus-visible）

## 安全验证

- [x] 所有查询绑定 userId
- [x] Cookie-based Session 鉴权
- [x] 画像候选需用户确认
- [x] 字段白名单拒绝非法修改
- [x] 跨用户数据隔离
- [x] 安全上下文白名单过滤

## 百宝箱集成

- [x] API/Manual/Mock 三级降级
- [x] 降级原因记录（fallbackReason）
- [x] mock 降级明确标注
- [x] 知识库检索正常
- [x] 流式 SSE 解析兼容

> **注意:** 真实百宝箱 API 调用需用户配置 TBOX_API_KEY、TBOX_APP_ID、TBOX_AGENT_ID 后手动验收。
