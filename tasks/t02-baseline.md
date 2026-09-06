# T02 清理 lint 范围与过期单测

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01/T05）/ 当前 · 执行：T02a + T02b

## 1. T02a 精确隔离 vendor lint

`eslint.config.mjs` 之前会把 `public/lib/*.min.js` 全部当作源码扫描，产生约 4037 个问题（占 baseline 4054 的绝大多数）。这些是第三方 vendor 浏览器库，由 `public/live2d/index.html` 加载，非本项目源码：

| 文件 | 来源 | 许可证 |
|---|---|---|
| `pixi.min.js` / `pixi-v6.min.js` | pixi.js v6.5.2 | MIT |
| `live2dcubismcore.min.js` | Live2D Cubism Core | Live2D Inc · Cubism |
| `live2d.min.js` | Live2D 显示层脚本 | Live2D |
| `pixi-live2d-display.min.js` | Pixi Live2D 显示层 | Live2D/Pixi |
| `index.min.js` | Live2D 配套脚本 | Live2D |

处理：只在 `ignores` 增加 `public/lib/*.min.js` 一条 glob（精确排除），并在注释中记录来源与许可证位置。自有 JS/TS 保持原有规则，未解除任何源码规则。验证 `eslint src e2e scripts` 也通过，证明源码仍被完整检查，未被宽泛 ignore 隐藏。

## 2. 更新过期单测断言

### `src/lib/simulation.test.ts`
旧断言要求 5 个场景枚举。实际产品已加入第 6 个 `career_interview`（依赖用户画像动态构建的岗位面试，由 `buildCareerInterviewScenario` 单独生成，不出现在通用目录）。更新为：
- 断言枚举含 6 个 key（含 `career_interview`）。
- `listSimulationScenarios()` 仍返回 5 个可选场景（面试场景被排除）。
- 新增 `buildCareerInterviewScenario` 元数据完整性用例（含岗位占位、评分维度、提示数目、通用目录不含面试场景）。

### `src/features/simulation/simulation-view.test.tsx`
旧断言校验旧文案“训练得分：82 分”。新评分 UI 使用可访问名 `aria-label="综合得分 82 分"`。更新为校验用户可见/可访问的评分与候选状态语义：
- score=82,无候选 → `aria-label="综合得分 82 分"`、`本次未生成画像候选`，不出现旧“训练得分：82 分”。
- score=null → `未产生正式评分`，不出现“训练得分： 分”。
- 有候选 → `画像候选已生成` + `记忆权限`。

## 3. T02b 修源码 lint

从 baseline 的 4054 个问题（183 errors / 3871 warnings）清理到 **0 errors / 0 warnings**：

- `src/lib/simulation.ts`：删除未使用 `roleKey`。
- `src/components/login-form.tsx`：移除未使用 `Map`、`MessagesSquare` 图标导入。
- `src/components/chat/kurisu-avatar.tsx`：删除从未读取的 `loaded` state 及其 `setLoaded` 调用。
- `src/components/chat/chat-thread.tsx`：`streaming`/`kurisuPhase` 保留在接口（供调用方通过类型契约）但不再函数解构，消除未使用变量，且不破坏 `chat-home` 调用。
- `src/app/api/simulations/route.ts`：移除未使用 `listSimulationScenarios` 导入。
- `src/components/chat/chat-home.tsx`：`ChatHomePage` 为已废弃死代码（从未 import/渲染/测试，由 T06 移除）。移除 4 个未使用声明：`runStats`/`setRunStats` 与 `runStartRef`（含 2 处调用）、`handleSelectConversationFromKurisu`、`latestAssistantText`、`kurisuStarted`。仅动死代码，未触碰他人在 chat-home 的 T03 `readApiJson` 迁移逻辑（WIP diff 分布在 6/41/51/85/254/282/311 行，与本清理不重叠）。
- `src/components/chat/kurisu-chat-window.tsx`：
  - 删除死代码：窗口 resize 三函数（`onResizePointerDown/Move/Up`）与 `resizeRef`（从未挂到 JSX）。
  - 删除从未读取的 `dialogSide` state（渲染用 `nearRightEdge` + `dialogPos.x<0` 判定）。
  - hook 依赖修正：`ensureDialogPosition`/`onDialogHeaderPointerMove` 用 `rect`，`openMenu` 去掉多余 `rect.w`。
  - `react-hooks/refs` 2 处：**最小复现确认该规则误报**。规则对“事件回调/异步回调内读写 ref”报“Cannot access refs during render”，但 `sendLocalMessage`/`loadConversationMessages` 只在 onSubmit/onClick/异步里访问 `localCidRef`，并非渲染期访问（React 明确允许事件处理器读 ref）。按 plan“最小复现再决定结构调整，不能直接关规则”——未全局关闭规则，仅对这两行加**带理由注释的 `eslint-disable-next-line react-hooks/refs`**。

## 4. 修改文件

`eslint.config.mjs`、`src/lib/simulation.ts`、`src/lib/simulation.test.ts`、`src/features/simulation/simulation-view.test.tsx`、`src/components/login-form.tsx`、`src/components/chat/kurisu-avatar.tsx`、`src/components/chat/chat-thread.tsx`、`src/app/api/simulations/route.ts`、`src/components/chat/chat-home.tsx`、`src/components/chat/kurisu-chat-window.tsx`。

## 5. 验证命令与结果

- `npm run lint` → 0 error / 0 warning（退出码 0）。
- `npm run test` → 125 文件全部通过，1085 用例全部通过（原 2 失败已修复，无 skip 扩大）。
- `npx tsc --noEmit` → 通过。
- `npm run test:migrations` → passing（fresh deploy/drift 与 legacy preservation/FKs）。
- `src/lib/agentic-v2/contract-matrix-sqlite.test.ts`（11 用例）在正常隔离环境通过——此前 EPERM 阻断已消除。

## 6. 未解决项 / 说明

- `chat-home.tsx`（`ChatHomePage`）为废弃死代码，仍留在仓库，由聊天重构 T06 移除；本次仅清理其未使用声明，未改其 `readApiJson` 迁移逻辑。
- `react-hooks/refs` 规则对事件回调内 ref 访问误报，已最小复现核实；仅两处就地 disable 并注明理由，未全局关闭。
- vendor `public/lib/*.min.js` 来源/许可证已在 `eslint.config.mjs` 注释记录。
