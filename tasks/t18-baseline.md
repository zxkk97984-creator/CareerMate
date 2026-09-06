# T18 成长档案三标签、建议深链接与安全的隐私操作

日期：2026-09-06 · 执行：agent · 对应提交：`ac41a7d`

## 目标（plan 4.3 成长档案 / T18）

- `/memory` 实现“待确认建议 / 画像与证据 / 记忆与隐私”三标签，默认“待确认建议”，支持深链接（`?tab=`）。
- 首页与训练报告能定位到具体建议，刷新/浏览器返回仍能定位。
- 画像与证据可读，候选操作不会误触清空；不新建可直接修改分数的表单。
- 建议与数据清空分开（清空放独立危险区域）。
- 隐私文案与实际记忆开关语义逐项核对。
- `MemoryView.confirmDelete` 判断响应成功。
- `ConfirmDialog` 改为等待异步 `onConfirm` 结果后才关闭；失败保留弹窗、禁止重复提交，不能由按钮无条件 `onClose`。

## 变更

### 修改 `src/components/ui/confirm-dialog.tsx`
- `onConfirm` 签名改为 `() => boolean | Promise<boolean>`（true=成功关闭；false/抛错=保留弹窗）。
- 新增 `busy` 状态：确认/取消/关闭按钮与 ESC 在“进行中”时禁用，防止重复提交。
- `handleConfirm`：`await onConfirm()`，成功才 `onClose()`；失败保留弹窗并展示错误（`role="alert"`）。
- 焦点圈定：打开时初始聚焦到弹窗卡片内首个可聚焦元素（`requestAnimationFrame`）；关闭后回焦到触发元素。
- 打开时清空上次错误；遮罩点击在 busy 时不关闭。
- 不再无条件 `onConfirm(); onClose()`。

### 修改 `src/features/memory/memory-view.tsx`
- **三标签布局**（`memory-tabbed` + `.memory-tabs`）：默认「待确认建议」=原候确认卡；「画像与证据」=画像基础信息 + 能力记录（只读）；「记忆与隐私」=长期记忆开关/列表/导出 + 清空。
- **深链接**：`?tab=` 经 `resolveMemoryTab` 解析，未知值回退“待确认建议”；`router.replace('/memory?tab=…')`，刷新/浏览器返回仍定位。
- **候选与清空分离**：候选确认留在「待确认建议」标签；「清空成长数据」改为独立危险区域（danger 底、圆角、与候选卡片空间分开）。
- **画像与证据只读**：展示 `targetRoleLabel`、专业、教育阶段、每周可投入、偏好 + 6 项能力记录分数；不新建可编辑分数表单。
- **隐私文案与语义对齐**：关闭记忆 → “AI 不再写入新的长期记忆；已有记忆仍被保留”，与后端 toggle 行为一致。
- **confirmDelete 返回 `Promise<boolean>`**：`!r.ok` → 返回 false（保留弹窗）；成功 → 清 target、返回 true（关闭弹窗）。
- **clearData 返回 `Promise<boolean>`**：失败保留输入、返回 false；成功清空确认词、跳转引导、返回 true。

### 修改 `src/features/simulation/simulation-view.tsx`
候选报告深链接由 `/memory` 改为 `/memory?tab=candidates`、文案“待确认建议”。

### 修改 `src/components/workspace.tsx`
`MemoryView` 传入 `profile` 并以 `<Suspense>` 包裹（供 `useSearchParams`）。

### 修改 `src/app/globals.css`
新增 `.memory-tabbed`、`.memory-tabs`、`.memory-tab`、`.memory-profile-grid`。

### 新增 `src/lib/memory-tabs.ts` + `src/lib/memory-tabs.test.ts`
`resolveMemoryTab(raw)` 解析深链接标签（未知回退 candidates）、`memoryTabs` 三标签列表；4 用例。

### 修改 `src/features/simulation/simulation-view.test.tsx`
候选报告用例改断言 `/memory?tab=candidates` 与“待确认建议”，替换旧“记忆权限”泛指。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 单测（memory-tabs） | `npx vitest run src/lib/memory-tabs.test.ts` | 4/4 通过 |
| 回归（simulation-view） | `npx vitest run src/features/simulation/simulation-view.test.tsx` | 3/3 通过 |
| 改动文件 lint | `npx eslint` 5 文件 | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 134 文件 / 1163 用例全绿 |
| 构建 | `npm run build` | exit 0 |

## 剩余风险

- 节点环境无真实浏览器/无 jsdom：ConfirmDialog 的“失败保留弹窗、成功关闭、禁用重复提交”交互与焦点圈定、标签切换的浏览器验证留 T19/T25。
- 深链接为标签层面；如需逐候选（candidateId）深链，可随后续任务收敛。
