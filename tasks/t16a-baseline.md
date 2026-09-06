# T16a 资源岗位标签、链接语义、空态和检索失败

日期：2026-09-06 · 执行：agent · 对应提交：`e6c25c4`

## 目标（plan 4.3 资源中心 / T16）

- 岗位选项由可用模板 + 当前岗位 + 资源中的有效岗位构成，不能只维护三项 roleLabels；未知/自定义岗位有可读名称，允许清筛选。
- 无空 option；无资源时可调整筛选。
- 有 URL 用真实语义链接；无 URL 不伪装成可跳转卡片。
- 检索失败与零结果分开展示。
- 裸 fetch 迁移至统一错误处理，带 request sequence 防结果竞态。
- 卡片展示 estimatedHours。

## 变更

### 新增 `src/lib/role-options.ts`
- `seedRoleLabels`：4 个种子岗位的规范可读名称。
- `roleLabelFor(roleKey, profile?)`：绝不返回空字符串——种子岗位用规范名；等于当前画像 targetRole 的自定义岗位用 targetRoleLabel；其余未知 key 回退为 key 本身（移除 `custom_` 前缀作为可读锚点）。
- `buildRoleOptions(profile, resourceRoleKeys)`：合并种子模板 key + `profile.targetRole` + 资源中实际出现的 roleKey，去重后映射为 `{key,label}`，过滤空 label。
- 岗位筛选首项为「全部岗位」清筛选项（value=""）。

### 新增 `src/lib/role-options.test.ts`
5 用例：种子规范名、画像自定义岗位标签、未知 key 永不空 label、去重合并、所有 option 非空。

### 修改 `src/features/resources/resource-view.tsx`
- 删除硬编码 `roleLabels`，改接 `buildRoleOptions` / `roleLabelFor`；岗位 select 由 `roleOptions` 渲染并带「全部岗位」清筛项。
- 外链卡片改为真实 `<a href target="_blank" rel="noopener noreferrer">`；无 URL 卡片保持不可点击 `<article>`（移除原 `role="link"`/`tabIndex`/`onClick`/`onKeyDown`/`window.open`），动作文案「查看实践说明」。
- 新增 `tboxError` 状态：检索失败（网络/业务）用 `InlineAlert tone="error"` 独立展示，与「未找到相关学习资源」零结果分开。
- 裸 `fetch("/api/tbox/retrieve")` 迁移至 `fetchApi`（统一 HTTP/业务/网络/取消归一化）。
- 引入 `tboxSeq` ref 记录每次查询序号，返回时校验 `seq === tboxSeq.current` 才写状态，丢弃迟到的旧查询防止覆盖新结果。
- 卡片底部展示 `约 {estimatedHours} 小时`。
- 搜索 label 文案改「搜索学习资源」（plan 4.3）。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 单测（role-options） | `npx vitest run src/lib/role-options.test.ts` | 5/5 通过 |
| 改动文件 lint | `npx eslint` 3 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 133 文件 / 1150 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险

- 节点环境无真实浏览器：筛选/键盘/空态/竞态的浏览器检查留待 T19/T25。
- 检索竞态的后滞（慢响应覆盖快响应）以纯前端 seq 守卫验证；接口 `/api/tbox/retrieve` 本身未改动。
