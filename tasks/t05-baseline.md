# T05 修复首次恢复历史的对话框

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01）/ 当前 · 执行：T05

## 1. 根因（对应评估 F02）

`kurisu-chat-window.tsx` 的 `loadConversationMessages` 原来只 `setDialogOpen(true)`，却从不初始化 `dialogPos`。渲染条件是 `dialogOpen && dialogPos`（二者必须同时为真），因此首次直接打开历史时，状态变成了 `dialogOpen=true` 但 `dialogPos=null`，对话框不渲染。同时底部运行信息仍按 `dialogOpen` 显示“N 条消息”，用户看到“2 条消息”却没有对话框。

## 2. 修复内容

- 抽出统一定位逻辑到新模块 `src/lib/kurisu-dialog-position.ts`（纯函数 `resolveDialogPosition` / `clampDialogPos`），并把组件内私有逻辑改为复用它。
- 新增组件内 `ensureDialogPosition`（经 `resolveDialogPosition` 确保 `dialogPos` 非空并钳制到视口）。
- `loadConversationMessages` 与 `openDialog` 都改为先 `ensureDialogPosition()` 再 `setDialogOpen(true)`，二者共用同一打开路径（plan 2.1 “新会话/恢复历史共用 open/placement 路径”）。
- 历史加载增加可见状态：`dialogLoading`（“正在加载历史…”）与 `dialogError`（按 status 归一化文案 + 重试按钮）。加载中禁用输入，避免在历史未就绪时误发；不再 `catch` 后静默。
- 位置边界校验：保存位置、视口 resize、手机视口均由 `clampDialogPos` 处理（含 390px 窄视口、离屏持久化值）。

## 3. 修改文件

- `src/lib/kurisu-dialog-position.ts`（新增）：`resolveDialogPosition`、`clampDialogPos`、`KURISU_RIGHT`、类型。
- `src/lib/kurisu-dialog-position.test.ts`（新增）：6 个用例。
- `src/components/chat/kurisu-chat-window.tsx`：导入复用 helper；`ensureDialogPosition`；`loadConversationMessages` 增加定位/loading/error；`openDialog` 复用定位；渲染增加 loading/error/重试，加载中禁用输入。

## 4. 回归测试

`src/lib/kurisu-dialog-position.test.ts`（6 用例）覆盖：
- 无保存位置（新建/首开历史）→ 必返回非空坐标（直接对应 F02：`dialogOpen && dialogPos` 恒成立）。
- 保存位置恢复 + 钳制；离屏持久化值钳制回视口；右侧空间不足翻到左侧；window 不可用时保守回退；390px 窄视口边界。

修复前该组件对首次打开历史无对话框；修复后定位逻辑保证打开历史时 `dialogPos` 非空。

## 5. 验证命令与结果

- `npx vitest run src/lib/kurisu-dialog-position.test.ts` → 6 用例全部通过（退出码 0）。
- `npx tsc --noEmit` → 通过。
- `npm run test` → 125 文件：123 通过，2 失败（均为 T02 职责的 simulation 断言）；1083 用例：1081 通过，2 失败。未引入回归。

## 6. 已知 lint（非本次引入，T02b 处理）

`kurisu-chat-window.tsx` 有 `react-hooks/refs` 规则报错（“Cannot access refs during render”）。
- 该规则在本组件是误报：被标记的 `sendLocalMessage` 与 `loadConversationMessages` 只在事件处理器/异步回调里读写 ref，并非渲染期访问。
- HEAD 版本已存在 1 处（`sendLocalMessage`）；本次新增的重试按钮调用同属一类，共 2 处。计划第 0.10 节已明确源码 lint 属于 T02b，此处不改规则、不禁用，交由 T02b 处理。未通过关闭规则换取绿色。

## 7. 未浏览器验证项 / 剩余风险

- 环境为 node 测试环境，未用真实浏览器复现“右键历史→对话框出现”；定位逻辑以纯函数回归测试证明 `dialogPos` 恒非空。浏览器交互验收（360/390/1024/1440、resize、离屏坐标）建议在 T07/T19 的浏览器轮次补做。
- 关闭面板不丢草稿、历史分页等属于 T06 前端工作台，未在 T05 范围。
