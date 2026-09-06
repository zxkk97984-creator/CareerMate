# T16b 任务上下文到资源再返回任务

日期：2026-09-06 · 执行：agent · 对应提交：`59a07a8`

## 目标（plan 4.3 资源中心 / T16）

- 由任务进入资源中心时保留 taskId/planId 上下文，显示“为当前任务查找资源”和返回任务。
- 任意 query 参数不可信，服务端按用户核验需要读取的实体（归属校验）。
- 任务跳转时传递上下文并在返回后保持任务/筛选上下文。

## 变更

### 修改 `src/app/api/resources/route.ts`
- querySchema 增加可选 `taskId`/`planId`（严格模式，重复传参返回 400）。
- 新增 `resolveTaskContext(userId, taskId, planId)`：服务端按用户核验实体归属——
  - 给了 `planId`：`careerPlan.findUnique` 校验 `plan.userId === userId`，从 `content` 的 `months[].learningTasks` 解析出 `taskTitle`，返回 `roleKey`（= 计划 `targetRole`）。
  - 只给 `taskId`：在该用户的所有计划中定位目标任务所在计划。
  - 不属当前用户或目标任务不存在 → `{ forbidden: true }` → 返回 404“无法验证该任务上下文，请从任务详情重新进入”。
- 上下文能确定角色时，用它作为资源筛选默认角色（用户显式传入的 `roleKey` 优先）。
- 响应新增 `context: { taskId, planId, taskTitle, roleKey }`。

### 修改 `src/app/api/resources/route.test.ts`
新增 4 用例：核验通过的上下文返回 owning plan 的 roleKey+taskTitle、显式 roleKey 覆盖默认角色、非本人计划返回 404、仅 taskId 跨用户计划定位。

### 修改 `src/components/path/task-detail.tsx`
- 新增可选 `planId` prop。
- 有 `planId` 时渲染「查找学习资源」`<Link>` → `/resources?taskId=<id>&planId=<id>`。

### 修改 `src/features/path/path-view.tsx`
TaskDetailPanel 调用传入 `planId={plan?.id}`。

### 修改 `src/components/workspace.tsx`
`<ResourceView>` 以 `<Suspense>` 包裹（资源页使用 `useSearchParams`）。

### 修改 `src/features/resources/resource-view.tsx`
- `useSearchParams` 读取 `taskId`/`planId`。
- 展示上下文：任务进入时顶部显示「为当前任务查找资源：<任务标题>」+「返回任务」按钮（→ `/path`）；核验失败显示可读错误，不伪装成功。
- 核验成功后用 `context.roleKey` 预填岗位筛选；返回任务时这些上下文由 URL 保留。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 单测（resources route） | `npx vitest run src/app/api/resources/route.test.ts` | 10/10 通过 |
| 改动文件 lint | `npx eslint` 6 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 133 文件 / 1154 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险

- 节点环境无真实浏览器：任务→资源→返回的实际导航、服务端核验的交互留 T19/T25。
- `useSearchParams` 需 Suspense 边界，已在 workspace 层包裹；资源页此时因 `useSearchParams` 属客户端渲染。
