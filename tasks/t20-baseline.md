# T20 按页面加载、局部失效刷新与关键 DTO

日期：2026-09-06 · 执行：agent

## 目标（plan T20）

- 每页 7 个业务请求的全量加载改为“页面所需数据 + 共享摘要”。
- 重图表/角色动态加载。
- memories/candidates/simulations/drafts 用现有 DTO 或新增精确读类型替换 any。
- 保存刷新只请求失效数据。

## 变更

### 新增 `src/lib/view-modules.ts` + `src/lib/view-modules.test.ts`
`modulesForView(view)`：每页只返回所需业务模块 + 必要共享摘要。
- `SHARED_MODULES = ["plan","candidates","v2Candidates"]`（任何视图都需要的侧栏待确认计数，含 pendingPlan）。
- 视图专属：simulation→simulations、resources→resources、memory→memories、admin→admin（drafts/templates）；dashboard/path/onboarding 不额外加载。
- 4 用例：各视图恒含共享摘要、resource 仅 resources 加载、admin 非 admin 不加载、去重且稳定顺序。

### 修改 `src/hooks/use-workspace-data.ts`
- `useWorkspaceData(activeView: View)`：`loadInitial`/`refresh` 改用 `modulesForView(activeViewRef.current)`（比原先固定 7 个全量更省）。
- 跨视图导航：新增 effect，当 `activeView` 变化时仅 `refreshSlices` 追加该页新需要的模块（不重载 `/api/me`、不重复加载已加载的共享摘要）。
- 既有的 `refreshSlices`（T04）即“保存刷新只请求失效数据”。

### 修改 `src/lib/workspace-types.ts`
用精确读 DTO 替换 `any[]`：`MemoryItemDto`、`V2CandidateDto`、`SimulationSessionDto`、`RoleDraftDto`、`RoleTemplateDto`（复用已有 `CandidateDto`、`ResourceItemDto`）。

### 修改使用处
- `use-workspace-data.ts`：admin 请求类型 `any[]` → `WorkspaceData["drafts"/"templates"]`。
- `memory-view.tsx`：props `any[]` → `MemoryItemDto[]`/`CandidateDto[]`/`V2CandidateDto[]`；`deleteTarget` 类型化。
- `admin-view.tsx`：props `any[]` → `RoleDraftDto[]`/`RoleTemplateDto[]`。
- `simulation-view.tsx`：本地 `SimulationSession` 改为 `SimulationSessionDto & { feedback? }`。
- `simulation-view.test.tsx`：测试补 DTO 必需字段。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 单测（view-modules） | `npx vitest run src/lib/view-modules.test.ts` | 4/4 通过 |
| 类型检查 | `npx tsc --noEmit` | 通过（无 any 泄漏到这些视图） |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 135 文件 / 1167 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险 / 待浏览器验证

- **动态加载重图表/角色**（CountUp/Recharts 按需 `next/dynamic`）：节点环境无法验证行为，留 T25。
- **同环境网络/性能测量**（前后请求数、传输字节、初次可操作时间）：需浏览器 DevTools/性能记录，不能只凭文件变少宣称提升；留 T25 实测并记录。
- 按页面加载的懒加载为“不请求不需要的模块”，已用 `modulesForView` 缩小首屏请求集；具体字节/耗时改善需浏览器确认。
