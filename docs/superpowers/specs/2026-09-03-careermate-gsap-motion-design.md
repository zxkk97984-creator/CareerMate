# CareerMate GSAP 动效设计 v1(方案 A:运动层 + 四类动效)

- 状态:已批准(2026-09-03,用户选定方案 A)
- 适用范围:`repo2`(当前主副本)。在 v13「明亮天蓝」视觉规范之上叠加运动层,不动任何视觉令牌。
- 关联文档:`DESIGN.md`(v13 UI 规范,尤其 §6 动效哲学)、`AGENTIC_V2_HANDOFF.md`。

## 0. 背景与目标

CareerMate 的静态视觉已由 v13 规范收敛(色彩/字体/圆角/阴影全部令牌化,对比度实算达标),但运动语言仍停留在散落的 CSS keyframes(`cm-rise`/`cm-typing`/`cm-spin` 等)与单处 GSAP 用法(`interactive-background` 鼠标视差)。本项目为全站建立**统一、克制、可测试**的动效层,延续 DESIGN.md §6 的哲学:动效是"生气",不是"装饰噪音"。

目标:

1. 用一个薄的 GSAP 运动层统一全站的节奏、缓动、stagger 与无障碍门控。
2. 覆盖核心交互面:欢迎页、聊天、候选卡、仪表盘、抽屉。
3. 不破坏 v13 视觉、不破坏现有 1036 项测试。
4. 新页面/新组件可复用同一层。

## 1. 决策记录

- **方案 A(运动层)胜出**。理由:一致的运动语言、可测试、可复用;排除 B(局部点缀,运动语言不统一、越加越乱)与 C(View Transitions + ScrollTrigger 全站大动效,违背克制原则且有破坏现有测试的风险)。
- **图表动画不交给 GSAP**:图表库为 recharts 3.1.2,数据描画用 recharts 自带动画(600ms),GSAP 只负责图表卡片的容器入场,二者不争抢同一元素。
- **Playwright 全局配置不加入 `reducedMotion`**(避免改变现有测试行为);新增 e2e 用例按需 `emulateMedia({ reducedMotion: 'reduce' })` 获得确定性。
- 仓库当前**不是 git 仓库**(repo2 无 .git),本文件直接落盘,不提交。

## 1.1 执行期决策与偏差(2026-09-03 实施后补充)

实施(分支 `motion/gsap-v1`,基线 `ee3c6df`)与终审后的最终口径,与上文不一致处以本节为准:

1. **雷达图不显式门控**:终审发现 `isAnimationActive={getMotionSafe()}` 会造成 reduced-motion 用户的 hydration 分叉(recharts 服务端按 true 渲染入场几何,客户端首帧为 false)。最终恢复 recharts 默认 `'auto'`(其内部已按 `prefers-reduced-motion` 自门控且 SSR 安全),保留 `animationDuration={600}`。
2. **记忆提案卡退出防重入**:`playExitFade` 的 250ms 窗口内允许二次点击会造成重复 POST/冲突提交,增加 `leavingRef` 守卫(终审 Important)。
3. **会话切换重置入场状态**:ChatThread 跨会话保持挂载,`activeConversationId` 变化时重置入场 refs 并视为首帧,避免"整体替换恰好差 1-2 条"触发入场动画(终审 M-1,已修)。
4. **Kurisu speaking 口径收窄**:speaking 时容器完全静止(Live2D 自带说话动作),仅 idle 呼吸 + waiting 思考倾斜;清理时 `gsap.set` 复位 transform(§5 #4 的"说话点头"按此收窄)。
5. **候选卡"其余淡出"收窄**:确认/提交只作用于被操作卡片自身的沉降与按钮隐藏,其他待确认卡片不联动(各自独立确认)。
6. **template 淡入用 `fromTo` 而非 `from`**:dev StrictMode 双跑 effect 时 `gsap.from` 会把被 kill 的残留 opacity 当作终点导致页面卡在半透明,`fromTo` 显式终点 1 修复(实测验证)。
7. **will-change 未显式挂/卸**:全部为 transform/opacity 短动画,合成器自行提升图层;仅 Kurisu 呼吸为持续动画,暂不加 `willChange`(可选 polish)。
8. **e2e 环境怪癖**:本机 Chrome(channel)不响应 `test.use({ reducedMotion })`,必须逐用例 `page.emulateMedia({ reducedMotion: "reduce" })`;opacity 断言用 `expect.poll` 等稳定态。
9. **基线问题**:仓库基线 lint 有 4054 个既有问题、vitest 有 2 个既有失败(simulation 相关),本特性以"不新增失败"为验收线,未修复基线问题(超范围)。
10. **repo2 已 git init**(基线 `ee3c6df`),本文件的"不提交"说明已过时;本文件随实施计划一并纳入版本控制。

## 2. 硬约束(不可违反)

1. 不动任何 v13 视觉令牌(颜色/圆角/字号/阴影);新增样式仅限运动相关(transform / opacity / will-change)。
2. 只动 `transform` + `opacity`,绝不动画布局属性(width/height/top/left/margin/padding)。
3. 所有 GSAP 动画用 `from`/`fromTo` 语义:JS 失败或动效关闭时元素处于最终可见态,绝不卡在 `opacity: 0`。
4. stagger 上限 8 项;超过 8 项的列表,前 8 项参与动画,其余直接显示。
5. 现有 CSS 动效(`cm-rise`、`cm-typing`、`cm-spin`、`cm-grow-x`、`cm-blink`、`cm-pulse-soft`)全部保留,不迁移、不重复实现。
6. 全站仍只有一个"编排型 flourish"(欢迎页 hero),对应 v13 的"唯一渐变文字"定位。
7. hover 不位移(v13 规则:hover 只改描边色 + 抬一级阴影),运动层不引入 hover lift。

## 3. 运动语言

| 类别 | 时长 | 缓动 | 用途 |
|---|---|---|---|
| 微交互 | 150–250ms | `power2.out`;按压回弹用 `back.out(1.4)` | 发送按钮、确认按钮 |
| 入场 | 300–450ms | `power2.out` | 消息、卡片、抽屉 |
| 编排 | 600–900ms 总长 | `expo.out`,单项 stagger 50–70ms | 欢迎页 hero |

- 出场一律快速(≤250ms,`power2.out`),不做慢速淡出。
- 循环动画仅两处:Kurisu 头像呼吸(transform 微幅)、spinner(已有 CSS)。
- 时长统一复用现有 CSS 令牌(`--cm-duration-fast` 等),不新增时长魔法数。

## 4. 架构:运动层

新增文件(全部为客户端组件/工具):

| 文件 | 职责与接口 |
|---|---|
| `src/lib/motion/motion-safe.ts` | `useMotionSafe(): boolean` — `matchMedia('(prefers-reduced-motion: reduce)')` 一次订阅;`true` 表示可播放。另导出同步版 `getMotionSafe()`(供 recharts `isAnimationActive` 等非 hook 场景) |
| `src/lib/motion/count-up.ts` | `useCountUp(target, { duration = 600, decimals = 0, separator })` 返回 `{ ref }`:挂载/目标变化时从当前值滚动到目标;门控关闭时直接落最终文本 |
| `src/components/ui/reveal.tsx` | `<Reveal variant="rise\|card\|fade" delay? stagger?>`:客户端组件,内部 `gsap.context()` + `from` tween;门控关闭时渲染为纯静态容器 |
| `src/app/template.tsx` | 新建。页面级入场:路由切换时整页容器 300ms **仅 opacity** 淡入(不做位移,避免与页内 Reveal 的 rise 叠加在同一元素上);不实现退出动画(App Router 无统一卸载时机,克制原则下放弃) |

改造点:

- `interactive-background.tsx`:视差行为保留,接入 `useMotionSafe`(关闭时静态显示,不挂 mousemove)。
- `globals.css`:不动 v13 令牌层;运动层共享 timing 一律复用现有 `--cm-duration-*` / `--cm-ease`,不追加任何 vN 覆盖段。

## 5. 分场景动效清单(本期)

| # | 场景 | 动效 | 时长 | 触发时机 |
|---|---|---|---|---|
| 1 | 欢迎页 hero | 标题三行逐行 rise、CTA 与功能卡 stagger 入场 | ~800ms | 页面 mount,一次 |
| 2 | 聊天消息入场 | 新消息 rise + fade | 350ms | 仅新消息**追加**时;初始加载与流式 token 更新不触发 |
| 3 | 快捷问题 | stagger 弹出 | 320ms | AI 回复完成后;上限 4 项 |
| 4 | Kurisu 头像 | 呼吸浮动(idle)+ 说话点头(speaking) | 循环 / 流期间 | 由现有 `kurisuPhase` 驱动 |
| 5 | 5 类候选卡(画像/计划/记忆/探索报告/工件) | 到达 stagger 弹入;点"接受"后卡片沉降、其余淡出 | 400ms / 250ms | 卡片到达、确认动作 |
| 6 | 仪表盘指标卡 | 数字 count-up | 600ms | 首次进入视口(IntersectionObserver,不引入 ScrollTrigger) |
| 7 | 雷达图 | 容器 Reveal + recharts 自带描画动画 | 600ms | 首次进入视口;填充保留(符合 v13 §4) |
| 8 | 抽屉/侧栏(画像抽屉、移动端导航) | 滑入 + 背景淡入 | 300ms | 打开时;关闭快速淡出 |
| 9 | 发送按钮 | 按压 scale 0.96 回弹;发送成功微冲(scale 1→1.03→1,150ms) | 180ms | pointerdown / 发送成功 |

**明确不做**(与 v13 一致):按钮扫光、角标脉冲、卡片 hover 位移、页面间复杂交叉转场、滚动叙事(ScrollTrigger)。

## 6. 无障碍与性能

- 全部 GSAP 动画过 `useMotionSafe()` 门控;recharts `isAnimationActive` 同步门控;`interactive-background` 同步门控。
- `gsap.context()` 统一管理清理,组件卸载即 kill;事件监听随 context revert。
- `will-change` 仅在动画进行中挂载,动画结束移除。
- 不新增 GSAP 插件(不引入 ScrollTrigger / SplitText / TextPlugin)。

## 7. 验证策略

1. `lint` / `typecheck` / `build` / 全量 Vitest + Playwright 保持全绿(基线 1036 项)。
2. 新增 Vitest 用例:
   - `motion-safe`:`matchMedia` 各分支(支持 reduce / 不支持 / API 未定义)。
   - `count-up`:门控关闭时直接落最终文本;格式化(小数、千分位)。
   - `reveal`:门控关闭时渲染为可见最终态(断言无 `opacity: 0`)。
3. 新增 e2e 冒烟:`emulateMedia({ reducedMotion: 'reduce' })` 下,欢迎页 / 聊天 / 仪表盘关键元素全部可见(防"卡在透明"回归)。
4. 视觉走查:复用 `work/` 下 headless 截图脚本,9 页面 × 双视口(1440 / 390)复查可见性 / 溢出 / 重叠,新截图输出到 `work/shots/`。

## 8. 范围

- **本期**:§4 运动层 + §5 全部 9 项场景 + §7 验证。
- **非目标**(后续再议):onboarding 分步转场、模拟面试评分揭晓、登录页动效、滚动叙事、页面退出动画。

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 流式更新导致消息组件重渲染、入场动画重播 | 入场仅绑定"消息追加"路径,与 token 渲染分离;必要时用 ref 记录已动画消息 id |
| 新增动效导致现有 e2e 时序 flaky | 不碰 Playwright 全局配置;新用例统一 reduced-motion;现有用例断言不依赖动画 |
| 低端机掉帧 | 只动 transform/opacity;stagger 上限 8 项;will-change 节制 |
| Reveal 用于 SSR 内容造成闪烁 | Reveal 为客户端组件且默认最终态可见(仅 `from` 动画),SSR 直出即可见 |
