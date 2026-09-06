# T10a 合并重复 token，保留实际视觉基线

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T07/T08/T09）/ 当前 · 执行：T10a

## 1. 根因

`globals.css` 有两处 `:root`：line 10 的 v14 oklch 草案，与 line 3892 的最终覆盖块（hex/rgb）。两处定义了**完全相同的 44 个 `--cm-*` token 名**，但值不同；因后者在 cascade 中更靠后，最终生效的是后者。plan 标记为“v14/v22 重复 token，需合并为一个最终真源”。

## 2. 修复

- 删除早先的 `:root` 草案块（原 line 10–76），只保留唯一的 `:root`（合并后 line 3825）作为**唯一 token 真源**。
- 核对合并前后：44 个 token 名逐一对应，**无一丢失**；关键最终值保持 `--cm-canvas:#F7F7F5`、`--cm-surface:#FFFFFF`、`--cm-brand:#0E76FF`、`--cm-content-max:1120px`、`--cm-reading-max:760px`。
- 未删除任何组件类/覆盖块（plan 要求“不能把后面的覆盖块直接删除”）；只移除被后者完全覆盖、且颜色相同的重复 token 声明。
- 文件头注释注明“设计 token 唯一真源位于本文件唯一的 :root，无重复覆盖块”。

## 3. 验证

- 单一 `:root` 校验：44 个 token、0 个 oklch 混入、含最终色值。
- `npm run build` → exit 0（CSS 语法有效，未破坏构建）。
- `npm run lint` → 0 error / 0 warning。
- `npm run test` → 127 文件 / 1111 用例全部通过。

## 4. 安全说明

合并是**可证明行为不变**的：两处 `:root` 同名同 specificity，最终值本就取自覆盖块；移除被覆盖的草案块不改变任何 computed value。因环境无浏览器，未逐页截图对比 computed styles；以“同名 44 token 全保留 + 最终值不变 + build/lint/test 全绿”为等价证据（plan T10a 要求保留实际视觉基线；浏览器级样式截图对比留 T19 前端轮次）。

## 5. 修改文件

`src/app/globals.css`。

## 6. 后续

T10b（页面标题/外壳/导航/断点）与 T10c（分页迁移 CSS）在此零散 token 清理基础上继续；均需浏览器截图对比，留前端轮次落地。本轮完成“token 单一真源”这一可静态验证部分。
