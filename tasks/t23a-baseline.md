# T23a 认证请求体/错误/注册并发边界

日期：2026-09-06 · 执行：agent

## 目标（plan T23a）

- 应用层 malformed JSON 返回 400，body 和字符串设合理上限。
- 注册唯一键竞态转稳定响应。
- 错误可供客户端分类，不暴露原始异常。
- 不把原始密码/令牌/聊天正文写入诊断日志。

## 变更

### `src/lib/api.ts`
- 新增 `DEFAULT_BODY_LIMIT_BYTES = 16 * 1024`（16KB）。
- 新增 `RequestBodyError`（携带 code/status）与 `bodyTooLarge()`。
- 新增 `parseBodyJson(request, limitBytes)`：`request.text()` 超上限 → 413；空体 → 400；`JSON.parse` 失败 → 400。调用方不再遇到 `request.json()` 在坏体时抛出的未归一化原始异常。

### `src/app/api/auth/login/route.ts`
- 用 `parseBodyJson` 读取，`RequestBodyError` 归一化为 `fail(code, message, status)`（坏体 400 / 超大 413）。
- schema 补 `username.max(64)`、`password.max(200)`。
- 登录失败统一 401“账号或密码错误”，不区分哪一项错。

### `src/app/api/auth/register/route.ts`
- 同用 `parseBodyJson` + 归一化。
- 注册 `user.create` 捕获唯一键并发竞态（P2002）→ 稳定 400“用户名已存在”，不暴露原始异常；非 P2002 错误照常抛出（不伪装成客户端错误）。

### 测试
- `src/lib/api.test.ts`（5 用例）：合法解析、坏体 INVALID_JSON(400)、空体(400)、超限 413、bodyTooLarge 工厂。
- `src/app/api/auth/register/route.test.ts`（4 用例）：坏体 400、用户名存在 400、P2002 竞态转 400、非冲突错误不伪装（rejects）。
- `src/app/api/auth/login/route.test.ts`（2 用例）：坏体 400、凭据错误 401 不泄露字段。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 单测（api + auth routes） | `npx vitest run src/lib/api.test.ts src/app/api/auth/{login,register}/route.test.ts` | 11/11 |
| 密码日志审计 | `grep -rn "password\|hash" src/app/api/auth src/lib/auth*.ts` | 无日志输出密码/哈希 |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 139 文件 / 1191 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待验证

- 请求体上限为应用层硬编码（16KB）；部署层（反向代理/网关）若还有各自 limit，需在 T23b 补充记录。
- 密码/令牌/聊天正文脱敏：auth 路由无此类日志；聊天正文的脱敏诊断日志接入属 T24，本次未重复实现。
- 流式/聊天正文的请求体上限（大 body 场景）未套用——本次聚焦认证入口；如聊天体更大，可在 T23b/后续调整分接口上限。
