# T10b 统一页面标题、外壳、导航与断点

日期：2026-09-06 · 执行：agent · 对应提交：`94a04e6`

## 目标（plan 4.2 / T10b）

- 每页 h1 与导航一致，aria-controls 指向真实 sidebar id。
- 去掉重复全局岗位标题（一个业务 h1）。
- 删除未使用 AppShell 前先查引用（已查：无引用，删除）。

## 变更

### 修改 `src/components/shell/product-sidebar.tsx`
`<aside>` 补 `id="primary-sidebar"`，使工作台移动端菜单按钮的 `aria-controls="primary-sidebar"` 指向真实存在的 id。

### 修改 `src/components/workspace.tsx`
移动端顶栏 `topbar-title` 由重复的角色标题（“{岗位} 工作台”）改为中立“工作台”，与 `PageHeader` 的 `<h1>{岗位} 成长工作台</h1>` 去重，业务页只有一个 h1。

### 删除死代码（查引用无使用）
- `src/components/shell/app-shell.tsx`（`AppShell`）
- `src/components/shell/mobile-navigation.tsx`（`MobileNavigation`）

二者均已确认无任何 import/引用（`grep` 全库无命中），工作台与聊天页各自直接用 `data-testid="app-shell"`。

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 引用核查 | `grep -rn "AppShell\|app-shell\|MobileNavigation" src e2e` | 仅定义文件自身，无外部引用 |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 改动文件 lint | eslint | 0 问题 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 134 文件 / 1163 用例全绿 |
| 构建 | `npm run build` | exit 0（无引用缺失） |

## 剩余风险

- 节点环境无浏览器：360/390/768/1024/1440 断点下无水平溢出/竖排按钮/顶部遮挡，需浏览器验证（T25）。
- `unified-shell.spec.ts` 断言 `heading { name: /成长工作台/ }` 仍命中（改的是移动顶栏 span，非 h1）。
