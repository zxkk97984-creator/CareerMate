# T03 统一客户端 HTTP/业务/JSON/网络错误契约

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01/T02/T05）/ 当前 · 执行：T03 · 对应提交：`dc2652f`

## 1. 实现内容（plan 第 2.4 节）

### `src/lib/workspace-types.ts`
- 新增可判别联合 `ApiResult<T>`：
  ```ts
  type ApiResult<T> =
    | { ok: true; data: T; status: number; meta?: ApiMeta }
    | { ok: false; status: number; error: { code: string; message: string; requestId?: string } };
  ```
- 新增 `ApiMeta`：区分分页/requestId 与 AI 执行来源语义；`aiExecution`（新）兼容旧接口平铺在 meta 顶层的 AI 字段（`requestedMode/actualMode/degraded/fallbackReason/source`）。
- 保留 `ApiPayload`（仍有视图在用，迁移在后续任务）。

### `src/lib/client-api.ts`
- `readApiJson`：安全解析，HTTP 错误/空 body/非法 JSON 返回 null（沿用他人已有 WIP）。
- 新增 `ApiError` 类：携带 `status`、`code`、`requestId`，供调用方按类别处理。
- 新增 `apiResultFromResponse`：分开处理 **HTTP 非 2xx** 与 **HTTP 200 但 body.ok=false**；空/HTML body 归一化；按状态映射稳定 code（401→UNAUTHORIZED、403→FORBIDDEN、404→NOT_FOUND、409→CONFLICT、422→INCOMPLETE_INPUT、429→RATE_LIMITED、5xx→SERVER_ERROR）。
- `fetchApi` 重写为返回 `ApiResult<T>`：捕获网络失败（status=0，code=NETWORK_ERROR）、AbortError（code=ABORTED，不作服务错误）；不自动重放 POST/候选接受等 mutation。
- `requireApiOk`：成功返回 data；失败抛带 status/code/requestId 的 `ApiError`（供 UI 分类：401 登录、409 冲突、404 不存在等）。
- 新增 `extractAiExecutionMeta(meta)`：从通用 meta 安全提取 AI 执行信息（优先 `aiExecution`，兼容旧平铺字段），避免裸 `as` 强制转换。

### `src/features/onboarding/onboarding-view.tsx`
- `setAiExecution(r.meta)` 改为 `extractAiExecutionMeta(r.meta)`，因 `ApiMeta` 比 `AiExecutionMeta` 宽（plan 2.4 明确两者不同语义）。

## 2. 契约行为（与后端 `{ok,data,meta}`/HTTP 状态对齐）

- HTTP 200 + ok:true → success。
- HTTP 非 2xx → failure（status=HTTP 状态，code 按状态映射），**不会被当成功**。
- HTTP 200 + ok:false（业务失败）→ failure（code=BUSINESS_ERROR 或业务 code）。
- 空 body / HTML body / 非法 JSON → 归一化为可读英文/中文 message，不抛原始异常。
- 网络失败 → status=0 + NETWORK_ERROR；取消 → ABORTED（不显示“服务错误”）。
- mutation 失败不自动重放。

## 3. 测试

`src/lib/client-api.test.ts`（17 用例）：
- readApiJson：JSON 解析、空/HTML 返回 null。
- apiResultFromResponse：200 success；409 error 带 code；401/403/404/422/429/500 默认 code 映射；200+业务失败；空 HTML 502→“服务暂时不可用”。
- requireApiOk：成功返回 data；失败抛 `ApiError` 带 status/code/requestId/message；非 JSON 500 安全 fallback。
- fetchApi：200 success；网络失败→0+NETWORK_ERROR；AbortError→ABORTED；401 传分类 code 且**只请求一次**（不自动重发）。
- extractAiExecutionMeta：aiExecution 取用、旧顶层字段兼容、无信息返回 null。

## 4. 修改文件

`src/lib/workspace-types.ts`、`src/lib/client-api.ts`、`src/lib/client-api.test.ts`、`src/features/onboarding/onboarding-view.tsx`。

## 5. 验证命令与结果

- `npx vitest run src/lib/client-api.test.ts` → 17 用例通过。
- `npm run test` → 125 文件 / 1099 用例全部通过（较 T02 的 1085 新增 14 个契约用例）。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过（所有既有 fetchApi/requireApiOk/readApiJson 调用方经判别联合类型安全，无隐式 any 或不安全 data 访问）。

## 6. 说明 / 剩余风险

- 既有 `fetchApi` 调用方（path/admin/memory/dashboard/onboarding 等）经判别联合自动收窄，`r.ok`/`r.data`/`r.error?.message` 用法均类型安全，无需逐处改动。部分视图（如 simulation-view 自带局部 request/ApiPayload、chat-view）仍未迁移，属后续任务的“裸 fetch 迁移”范围。
- `client-api.ts` 在他人的 `readApiJson`/`requireApiOk` WIP 之上扩展（从 `throw new Error` 改为抛带分类字段的 `ApiError`，调用方按 message 处理的逻辑不受影响）。
- `workspace.tsx` 的 `loadAll` 仍用 `fetchApi`，其“仅 401 去登录”属于 T04（加载/刷新分离）的 F03 修复，本轮只交付契约。
