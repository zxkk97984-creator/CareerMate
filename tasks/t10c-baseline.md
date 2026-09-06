# T10c 分页迁移 CSS，避免无界全局覆盖

日期：2026-09-06 · 执行：agent

## 目标（plan T10c）

- 建立 tokens/base/shell/page 分层文件，由 globals.css 统一 import，保持 Tailwind 导入规则。
- token 单一真源；避免无界全局覆盖补丁堆积。

## 变更

### 新增 `src/app/styles/tokens.css`
全局唯一 `:root` 令牌真源（画布 #F7F7F5、表面、文字、品牌蓝 #0E76FF、圆角、阴影、侧栏/内容宽度、动效时长）+ `body` 令牌绑定。**从 globals.css 迁移**，无重复覆盖块。

### 新增 `src/app/styles/base.css`
基础层：universal reset、html/body、光标/选中策略（含 T19 正文可复制）、焦点环、文本输入焦点、滚动条。**从 globals.css 迁移**。

### 修改 `src/app/globals.css`
- 顶部改为：
  ```css
  @import "tailwindcss";
  @import "./styles/tokens.css";
  @import "./styles/base.css";
  ```
- 移除已迁移至上述两文件的 `:root` 块、`body` 令牌绑定与 base reset 段。
- 文件头注释更新说明：令牌/基础已分层，其余为 shell 与页面级组件样式。

## 分层结果

- **tokens**：`styles/tokens.css`（唯一 :root）
- **base**：`styles/base.css`（reset/光标/焦点/滚动条）
- **shell/page**：`globals.css`（组件类、动效、响应式、各页面样式）

## 验证

| 项 | 命令 | 结果 |
|---|---|---|
| :root 唯一性 | `grep -c "^:root {" globals.css styles/tokens.css` | tokens.css:1；globals.css:0 |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 全量 lint | `npm run lint` | 0/0 |
| 全量测试 | `npm run test` | 134 文件 / 1163 用例全绿 |
| 构建（CSS @import 链解析） | `npm run build` | exit 0 |

## 剩余风险

- 迁移属纯搬运（内容逐字节一致），无视觉改动；最终 computed styles / 断点行为由浏览器验证（T25）。
- 组件样式仍集中在 globals.css（未逐一拆 page 文件），分层入口与核心层已建立，后续可继续拆分。
