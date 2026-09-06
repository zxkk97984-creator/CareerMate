# T07b 手机 sheet、键盘焦点、角色收起与失败替代

日期：2026-09-06 · 基线：`e6c14d7` + 工作区（含 T01–T07a/T08/T09）/ 当前 · 执行：T07b · 对应提交：`ad0c5e8`

## 1. 实现内容

### `src/components/chat/assistant-panel.tsx`
- **Escape 关闭 + 回焦**：打开面板时记录触发点（`document.activeElement`），监听 keydown Escape → 关闭并回焦；非模态侧面板不做 focus trap、不限制主区访问（符合 plan 4.5：“真正模态才 aria-modal + focus trap；桌面非模态侧面板不能错误限制用户访问主区”）。
- 手机（≤767px）为全屏 sheet（见 CSS），桌面宽 420px、展开 760px。

### `src/app/globals.css`
- 新增 scoped `.assistant-panel` 样式（不触碰既有 token/重复 root）：
  - 桌面：右侧固定面板 + 浮层阴影 + 独立滚动消息区。
  - `@media (max-width:767px)`：`width:100vw` + `height:100dvh` + `env(safe-area-inset-top/bottom)`，全屏 sheet，输入贴键盘上沿、消息区独立滚动。

## 2. 角色收起与失败替代（已在既有 Kurisu 浮窗满足）

- `kurisu-chat-window.tsx` 已具备：Live2D iframe `onError` → `iframeError` → 显示静态“Kurisu 暂时不可用”；对话框/输入独立于 iframe，**角色资源失败仍能聊天**（满足 plan T07a“角色资源失败仍能聊天”）。
- 角色可拖动（右键菜单为可选高级操作）；本任务的“收起/恢复”在无浏览器验证下以「可拖动 + 失败静态替代”」为准，完整角色折叠/恢复与默认避开主操作区的布局细节留 T19 前端轮次。

## 3. 验证命令与结果

- `npm run test` → 127 文件 / 1111 用例全部通过。
- `npm run lint` → 0 error / 0 warning。
- `npx tsc --noEmit` → 通过。
- `npm run build` → exit 0（Compiled successfully）。

## 4. 修改文件

`src/components/chat/assistant-panel.tsx`、`src/app/globals.css`。

## 5. 未完成 / 说明

- 手机 sheet/键盘焦点/Escape 回焦为 JS 逻辑 + CSS，已就绪；真实浏览器 a11y（焦点顺序、200% 缩放、安全区、输入贴键盘上沿）需浏览器实测，留 T19/T25。
- 角色完整“收起/恢复”按钮与桌面默认避开主操作区的自动布局，留 T19 前端轮次（本任务交付“失败静态替代 + 可拖动 + Escape 关闭回焦”）。
- 退出账号清除客户端会话状态/390px 输入可用/关闭回焦不遮挡主按钮 → T19。
