# T04 初次加载与局部后台刷新分离，保留页面状态

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T03/T05）/ 当前 · 执行：T04

## 1. 根因（对应评估 F03）

原 `workspace.tsx` 的 `loadAll` 存在三个问题：
1. `setLoading(true)` 在开头，任何一次刷新（子视图保存任务/记忆/训练后调用 `refresh`）都会让 `if (loading... ) return <骨架>` 命中 → **卸载当前视图**，丢失输入/选择/滚动。这是“更新后当前视图不卸载”的根因。
2. `if (!me.ok) router.push("/login")` → 任何 `/api/me` 错误（含 500）都被送去登录。
3. 模块失败被静默转成 `[]`（`memories.ok ? items : []`），把失败伪装成空列表。

## 2. 改动

### 新增 `src/hooks/use-workspace-data.ts`
把加载状态机封装为 hook，暴露 `{ state, setNotice, updateAiRuntime, refresh, refreshSlices, retryFatal }`：

- **initialLoading**：仅首次且尚无 `data.user` 时置 true；之后后台刷新不再回到骨架。
- **refreshing**：后台刷新标志（内容保留，仅顶部“正在更新”小状态），刷新不卸载视图。
- **fatal**：`/api/me` 失败且非 401（如 5xx）→ 保留壳 + “重试加载”。只有 `error.code === "UNAUTHORIZED"` 才 `router.push("/login")`（第 2.4 节：仅明确 401 触发登录；403 权限、5xx 保留现场）。
- **moduleErrors**：每个业务模块独立成功/失败结果，失败保留旧数据并记录错误，不伪装为空列表。
- **refreshSlices(keys)**：只重取失效切片并局部合并到 `data`（保存后可避免整页重载）。
- **request sequence**：`seqRef` 防过时请求覆盖新结果；`mountedRef` 卸载后不再写状态。

### `src/components/workspace.tsx`
- 改用 `useWorkspaceData`，删除本地 `data`/`loading`/`aiExecution` 状态。
- 骨架仅在 `initialLoading && !data.user`；`fatal` 时显示带“重试加载”的保留壳。
- 子模块失败显示非阻断的错误条（“计划、资源…未能加载” + 重试，重试用 `refreshSlices(failedModules)`），其他模块继续。
- 子视图 `refresh` 传后台刷新版（不再触发整页骨架/卸载）。
- `data-ai-mode` 改读 `data.aiRuntime.actualMode`；OnboardingView 的 `setAiExecution` 接 `updateAiRuntime`（合并进 data.aiRuntime）。

## 3. 验证命令与结果

- `npx tsc --noEmit` → 通过。
- `npm run lint` → 0 error / 0 warning。
- `npm run test` → 125 文件 / 1099 用例全部通过。
- `npm run build` → **exit 0**（Next 生产构建成功，路由/客户端-服务端边界无断裂）。

## 4. 修改文件

`src/hooks/use-workspace-data.ts`（新增）、`src/components/workspace.tsx`。

## 5. 环境受限项（按 plan §0.9 单独记录，不打勾为“完整浏览器验证”）

- 本执行环境为 node（无 jsdom / @testing-library / react-test-renderer），无法挂载 hook 做交互式行为测试，也无法用真实浏览器模拟“慢请求 + 模块 500 → 无 loading 闪回”。
- 因此 T04 的行为正确性以「构建成功 + 全量测试 + 类型检查 + 静态逻辑核对」佐证；浏览器级验证（慢请求、模块 500、保存后视图不卸载、输入/滚动保留）留待 T19/T25 的浏览器轮次。
- 记录：`refresh` 不再调用 `setLoading(true)`（去掉卸载触发点），骨架仅 `initialLoading && !data.user`，`fatal` 走重试壳——这些从代码静态可证。

## 6. 剩余风险 / 说明

- 子视图（dashboard/path/memory 等）仍以 `refresh`（全量后台）触发刷新；`refreshSlices` 已就绪但尚未逐视图接入（保存后精准局部刷新）——属后续 T11/T13/T17 的逐页集成。
- 旧 `AiRuntimeSnapshot`/`aiExecution` 独立 state 已并入 hook 的 `data.aiRuntime`，无重复真源。
