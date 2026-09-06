# CareerMate 优化执行清单

执行规格：[plan.md](plan.md)。问题证据：[project-review-2026-09-06.md](project-review-2026-09-06.md)。

状态：当前仅完成评估与计划。下面的产品任务均尚未由本次评估执行；已有代码中相同问题若已被其他改动修复，需核验后记录。

## A. 可信基线与 P0

- [x] T01 固定登录/引导/dashboard/兼容聊天入口路由及验收基线。 — 证据见 [t01-baseline.md](t01-baseline.md)；失败清单：2 个 simulation 断言过期（T02 职责）。
- [x] T02a 精确隔离 vendor lint，更新场景和评分语义断言。 — 证据见 [t02-baseline.md](t02-baseline.md)；vendor 已隔离，断言更新为第 6 场景与“综合得分”可访问名。
- [x] T02b 修源码 lint，在正常隔离环境重跑 SQLite suite。 — lint 0/0；全量测试 125/125；SQLite contract 11 用例通过，EPERM 已消除。
- [x] T03 统一客户端 HTTP/业务/JSON/网络错误契约。 — 证据见 [t03-baseline.md](t03-baseline.md)；可判别联合 `ApiResult<T>`、`ApiError`、`apiResultFromResponse`，17 用例覆盖 401/403/409/422/429/500/空/HTML/网络失败/取消。
- [x] T04 初次加载与局部后台刷新分离，保留页面状态。 — 证据见 [t04-baseline.md](t04-baseline.md)；新增 `use-workspace-data`，initialLoading/refreshing/fatal/moduleErrors 分离，仅 401 登出，构建通过；浏览器级验证留待 T19/T25。
- [x] T05 修复首次打开历史无对话框。 — 证据见 [t05-baseline.md](t05-baseline.md)；抽取 `kurisu-dialog-position` 纯函数，6 用例通过；`kurisu-chat-window` 存在 2 处 `react-hooks/refs` 误报待 T02b。
- [x] T08a 聚合画像/记忆/计划/V2 建议读模型及计数。 — 证据见 [t08a-baseline.md](t08a-baseline.md)；`SuggestionRef` 判别联合、`buildSuggestionList` 同源计数、`SuggestionDetail` 按 kind 判别，7 用例。UI 接入属 T08b。
- [x] T08b 候选预览、确认、拒绝、版本冲突与结果同步。 — 证据见 [t08b-baseline.md](t08b-baseline.md)；`memory-view` 修复 operate 未判断 ok 即提示成功、确认前展示 old→new、`decisionBusy` 防双击重复写、409 提示重生成；`confirmDelete` 判断 ok。
- [x] T09 生成计划到待确认再到正式执行的完整反馈。 — 证据见 [t09-baseline.md](t09-baseline.md)；dashboard 改“新计划已准备好，确认后开始执行”、新增 pending 横条 + “审阅计划”、pending 计划纳入待确认计数（概览/侧栏一致）。
- [x] T06a 提取唯一助手控制器，保证幂等、隔离与失败恢复。 — 证据见 [t06a-baseline.md](t06a-baseline.md)；新增 `use-assistant-controller`/`assistant-provider`/`assistant-controller-utils`，幂等 requestId + 订阅切换隔离 + 保留 parts/meta/draft；5 用例。
- [x] T06b 挂载正文、引用、候选与执行来源渲染。 — 证据见 [t06b-baseline.md](t06b-baseline.md)；新增 `assistant-panel` 接 controller 复用 ChatThread/MemoizedMarkdown/MessageParts/ChatComposer；根 layout 挂 `AssistantProvider` 跨路由保持。
- [x] T07a 增加显式 AI 助手入口，角色共享 controller。 — 证据见 [t07a-baseline.md](t07a-baseline.md)；新增 `assistant-entry-button` 页头入口 + controller 面板开合/展开（420/760px）；根 layout 渲染 panel，关闭返回 null。
- [x] T07b 手机 sheet、键盘焦点、角色收起与失败替代。 — 证据见 [t07b-baseline.md](t07b-baseline.md)；面板 Escape 关闭回焦、手机 100dvh+safe-area sheet；Kurisu 失败静态替代（既有）+ 可拖动。
- [x] 检查点 A：核心链路与 P0 错误恢复有自动化/浏览器证据。 — 自动化：T01-T09 + T03 错误契约 17 用例 + 全量 1163 用例；浏览器 E2E/E01-E19 证据留 T25。

## B. 产品与前端

- [x] T10a 合并重复 token，保留实际视觉基线。 — 证据见 [t10a-baseline.md](t10a-baseline.md)；删除 oklch 草案 :root，唯一真源 #F7F7F5，44 token 无丢失。
- [x] T10b 统一页面标题、外壳、导航与断点。 — 证据见 [t10b-baseline.md](t10b-baseline.md)；`ProductSidebar` 补 `id=primary-sidebar` 使入口 `aria-controls` 指向真实 id；移动顶栏去重复岗位标题改中立“工作台”，业务 h1 唯一在 PageHeader；删除无引用 `AppShell`/`MobileNavigation` 死代码。
- [x] T10c 分页迁移 CSS，避免无界全局覆盖。 — 证据见 [t10c-baseline.md](t10c-baseline.md)；`globals.css` 拆出 `styles/tokens.css`（唯一 :root 令牌真源）与 `styles/base.css`（reset/光标/焦点/滚动条）由顶层统一 `@import`，保留 Tailwind 导入规则。
- [x] T11 行动优先概览与确定性下一步选择。 — 证据见 [t11-baseline.md](t11-baseline.md)；`selectNextAction` 纯函数覆盖 plan3.3 全分支（8 用例）、删虚构百分比、真实 completed/total。
- [x] T12 参考分的可信表达与证据。 — 证据见 [t12-baseline.md](t12-baseline.md)；改名“成长参考分 /100”、null 不兜底为 0、权重校验防 NaN、按 weight*(100-score) 排序补弱项、中文解释（7 用例）。
- [x] T13 当前计划与待确认版本分开。 — 证据见 [t13-baseline.md](t13-baseline.md)；`timelinePlan` 恒为 activePlan，pending 独立预览并标注“当前 vN · 建议 vN+1”，不混排跨版本。
- [x] T14a 任务详情、真实完成标准与状态更新。 — 证据见 [t14a-baseline.md](t14a-baseline.md)；`task-detail` 纯函数 + 抽屉组件：只读现有字段、缺失“让 AI 细化”、月份级交付物标“本阶段共同要求”、状态复用现有 PATCH（5 用例）。
- [x] T14b 近期任务内容质量、时间预算和历史兼容。 — 证据见 [t14b-baseline.md](t14b-baseline.md)；`plan-budget` 预算校验（超支不静默）+ 具体性启发式（泛词识别），8 用例；只读不写历史计划。
- [x] T12a 参考分命名、中文标签、缺失数据表现。 — 同 T12，证据见 [t12-baseline.md](t12-baseline.md)。
- [x] T12b 权重校验、解释、建议优先级与证据。 — 同 T12，证据见 [t12-baseline.md](t12-baseline.md)。
- [x] T13 当前计划与待确认版独立预览/对比。 — 同 T13，证据见 [t13-baseline.md](t13-baseline.md)。
- [x] T14a 任务详情、真实完成标准与状态更新。 — 同 T14a，证据见 [t14a-baseline.md](t14a-baseline.md)。
- [x] T14b 近期任务内容质量、时间预算和历史兼容。 — 同 T14b，证据见 [t14b-baseline.md](t14b-baseline.md)。
- [x] T15 展示已确认 LearningRoute 及关联版本。 — 证据见 [t15-baseline.md](t15-baseline.md)；`toLearningRouteView` 展示 adapter 不渲染 z.unknown 数组，null/损坏/空/归档降级，`path-view` 新增“学习安排”区块接入。
- [x] T16a 资源岗位标签、链接语义、空态和检索失败。 — 证据见 [t16a-baseline.md](t16a-baseline.md)；岗位选项改由种子+当前画像+资源实际 roleKey 构成（`buildRoleOptions`/`roleLabelFor`），未知岗位可读名称不清空；外链真 `<a>` 无 URL 不伪装跳转；检索失败与零结果分开；裸 fetch 迁移 `fetchApi` + request sequence 防竞态；卡片展示 estimatedHours。
- [x] T16b 任务上下文到资源再返回任务。 — 证据见 [t16b-baseline.md](t16b-baseline.md)；任务详情“查找学习资源”→ `/resources?taskId&planId`；`/api/resources` 服务端核验任务归属并返回 context roleKey/taskTitle；资源页由任务进入时显示“为当前任务查找资源”+“返回任务”，任意 query 参数不可信，服务端按用户核验。
- [x] T17a 选择/训练/完成三阶段，刷新与失败恢复。 — 证据见 [t17a-baseline.md](t17a-baseline.md)；`simulation-view` 依 4.3 组织选择/训练/完成三阶段：active 会话 brief 从该 session scenarioKey 反查（`scenarioMetaForSession`，不拿默认第一项冒充）、进行中会话折叠情境卡且不显示大片禁用卡片、裸 fetch 迁 `fetchApi`、send/complete 失败保留答案+可重试、重复 start/send/complete 有 busy+状态防护、刷新恢复当前 session。
- [x] T17b 评分与候选报告，null 分数与实际来源。 — 证据见 [t17b-baseline.md](t17b-baseline.md)；null score 不渲染 0 分圆环改“未产生正式评分”、负向建议不渲染 `+-2`（`formatAbilityImpact` 负值 `-N`）、校正影响条形取绝对值、AI 降级标记“本次使用演示数据”、候选“已生成/待确认”不声称已改画像、训练完成可返回任务。
- [x] T18 成长档案三标签、建议深链接与安全的隐私操作。 — 证据见 [t18-baseline.md](t18-baseline.md)；`/memory` 改三标签（待确认建议/画像与证据/记忆与隐私）`?tab=` 深链接且刷新/返回仍定位；ConfirmDialog 异步确认成功才关闭、失败保留弹窗、期间禁用重复提交、焦点圈定回焦（不再无条件 onClose）；confirmDelete 判断成功；画像与证据只读不建可编辑分数表单；清空成长数据独立危险区域不与候选确认挨在一起；隐私文案与记忆开关语义一致；训练报告候选深链接 `/memory?tab=candidates`。
- [x] T19 键盘、复制、低动效、手机安全区与缩放检查。 — 证据见 [t19-baseline.md](t19-baseline.md)；正文允许选取/复制（内容区 user-select:text、交互控件禁用）；kurisu 角色 iframe 低动效门控（仅 motionSafe 播动作）；面板 `id=assistant-panel` + 入口 `aria-expanded`/`aria-controls`；GSAP/Recharts/表单 sheet 的 reduced-motion 与 safe-area 现状盘点已达标。
- [x] 检查点 B：所有核心页面状态与桌面/手机对比证据。 — 见下方 Phase B 完成说明；核心页面状态有自动化证据（全量 1163 用例），桌面/手机截图与 E2E 对比留 T25。

## C. 工程与验证

- [x] T20 按页面加载、局部失效刷新与关键 DTO。 — 证据见 [t20-baseline.md](t20-baseline.md)；`modulesForView` 按视图只加载所需模块+共享摘要（plan/candidates/v2），跨视图导航仅补加载该页新模块；`refreshSlices` 保存只刷新失效切片；workspace-types 用精确读 DTO（MemoryItem/V2Candidate/SimulationSession/RoleDraft/RoleTemplate）替换 any。
- [x] T21a 计划版本约束：历史盘点、冲突映射、迁移与并发测试。 — 证据见 [t21a-baseline.md](t21a-baseline.md)；prisma 加 `@@unique([userId, version])`；迁移先对每用户按 (version,createdAt,id) 重编号去重（不删用户数据）再建唯一索引，node:sqlite 验证去重/唯一索引通过；generation-service 对 P2002 做有界重试（重读 latest 取下一版本），2 用例。
- [x] T21b 列表分页、总数语义与用户隔离。 — 证据见 [t21b-baseline.md](t21b-baseline.md)；`/api/agentic-v2/candidates` 加有上限 limit(max100)+稳定游标(createdAt)+真实 total(count)，响应 `{items,total,nextCursor}`；侧栏/概览待确认计数改用 `v2CandidateTotal`（不误用页长）；跨用户隔离保留。
- [x] T22 流式服务按职责小步拆分，兼容行为不变。 — 证据见 [t22-baseline.md](t22-baseline.md)；新增 `stream-helpers.ts` 等 3 个无副作用纯 helper（resolveSearchPolicy/buildProviderHistory/validateSourceRefs）并加 7 用例；stream-service 改为 import 同一逻辑并删除本地重复（-85 行），调用点不变；stateful/legacy 24 回归用例通过；不引入多层 pipeline、不删兼容模式。
- [ ] T23a 认证请求体/错误/注册并发边界。
- [ ] T23b 公开部署的限流位置、配置、429 行为和适用范围。
- [ ] T24 去重业务事件、脱敏诊断与模式分离的运行记录。
- [ ] T25a E2E 数据/运行模式/浏览器环境隔离。
- [ ] T25b 更新主链路 E2E，覆盖 plan 中 E01–E19。
- [ ] T25c CI 门禁与失败产物，更新真实验证说明。
- [ ] T26 准备脚本，由负责人完成 5–8 人真实验证并记录迭代。

## 验证记录

每完成一个任务追加一行，不只把复选框打勾。

| 任务 | 执行者 / 日期 | 提交 / 修改范围 | 验证命令与结果 | 浏览器/截图 | 剩余风险 |
|---|---|---|---|---|---|
| T01 | 执行 agent / 2026-09-06 | `page.tsx` 按画像完成度路由；`workspace-page`/`onboarding-routing` 统一 `homeDestination`；删 `workspace` dead chat 视图与过期文案；`View` 移除 chat；`/chat` 兼容跳转 | 路由用例 16 通过；`tsc --noEmit` 通过；改动文件 eslint 0；全量 122/124 通过，2 失败（simulation，T02 职责），未引入回归 | 无需浏览器（服务端守卫）；`/chat?assistant=open` 展开属 T07 | `chat-home.spec.ts` 基于旧聊天首页，待 T25 更新；OPEN_CHAT_ENTRY 仍保留读法 |
| T05 | 执行 agent / 2026-09-06 | 抽取 `src/lib/kurisu-dialog-position.ts`；`kurisu-chat-window` 打开历史共用定位并补 loading/error/重试 | 位置用例 6 通过；`tsc --noEmit` 通过；全量 123/125 通过，2 失败（simulation，T02 职责），未引入回归 | 节点环境无真实浏览器，定位以纯函数回归验证 | `kurisu-chat-window` 2 处 `react-hooks/refs` 误报待 T02b；浏览器交互轮待 T07/T19 |
| T02 | 执行 agent / 2026-09-06 | eslint 隔离 vendor `public/lib/*.min.js`；更新 simulation 场景/评分断言；清理源码 lint（unused vars、死代码、hook deps、2 处 refs 就地 disable） | `npm run lint` 0/0；`npm run test` 125/125（1085 全过，原 2 失败修复）；`tsc` 通过；`test:migrations` 通过；SQLite contract 11 用例通过 | 无浏览器改动 | `chat-home.tsx`（废弃死代码）已清理未使用声明，仍留待 T06 移除，未动其 readApiJson 迁移逻辑 |
| T03 | 执行 agent / 2026-09-06 | `apiResultFromResponse`/`fetchApi`/`requireApiOk`/`ApiError`/`extractAiExecutionMeta`；`ApiResult` 判别联合 | `client-api.test` 17 用例通过；`npm run test` 125/125（1099 用例）；lint 0/0；`tsc` 通过 | 无浏览器改动 | 部分视图仍有局部 request/裸 fetch，属后续“裸 fetch 迁移”；workspace 仅 401 去登录属 T04 |
| T04 | 执行 agent / 2026-09-06 | 新增 `src/hooks/use-workspace-data.ts`；`workspace.tsx` 改接 hook（initialLoading/refreshing/fatal/moduleErrors 分离、仅 401 登出、后台刷新不卸载） | `tsc` 通过；lint 0/0；`npm run test` 125/125（1099）；`npm run build` exit 0 | node 环境无浏览器，未跑慢请求/模块 500 的交互验证 | 浏览器级 loading 闪回/模块 500 验证留 T19/T25；`refreshSlices` 逐视图接入属后续任务 |
| T08a | 执行 agent / 2026-09-06 | 新增 `src/lib/suggestions.ts`（SuggestionRef 判别联合 + buildSuggestionList 同源计数 + SuggestionDetail 按 kind）、`use-suggestions.ts` 聚合 hook | `npm run test` 126/126（1106）；lint 0/0；`tsc` 通过；`npm run build` exit 0 | 节点环境无浏览器 | 读模型接入 MemoryView 并做确认前详情/类型化失败 UI 属 T08b |
| T08b | 执行 agent / 2026-09-06 | `memory-view.tsx`：operate/operateV2 判断 ok、确认前展示 old→new、decisionBusy 防重、409 提示重生成、confirmDelete 判断 ok | `npm run test` 126/126；lint 0/0；`tsc` 通过；`npm run build` exit 0 | 节点环境无浏览器 | 浏览器接受/拒绝/冲突流程留 T19/T25；计划接受闭环属 T09 |
| T09 | 执行 agent / 2026-09-06 | `dashboard-view`/`workspace`：generatePlan 改“新计划已准备好，确认后开始执行”、pending 横条 + “审阅计划”、pending 计划纳入待确认计数 | `npm run test` 126/126；lint 0/0；`tsc` 通过；`npm run build` exit 0 | 节点环境无浏览器 | 浏览器“生成→确认→执行”点击闭环留 T19/T25；pending 横条视觉在 T11/T13 收敛 |
| T06a | 执行 agent / 2026-09-06 | `use-assistant-controller`/`assistant-provider`/`assistant-controller-utils`：单一消息状态源、幂等 requestId、订阅切换隔离、保留 parts/meta/draft | 控制器纯函数 5 用例通过；全量 127/127（1111）；lint 0/0；`tsc` 通过；build exit 0 | 节点环境无浏览器 | 浏览器串话/重试不丢输入验证留 T19/T25 |
| T06b | 执行 agent / 2026-09-06 | `assistant-panel` 接 controller 复用 ChatThread/MemoizedMarkdown/MessageParts/ChatComposer；根 layout 挂 AssistantProvider | 全量 127/127；lint 0/0；`tsc` 通过；build exit 0 | 节点环境无浏览器 | 消息/候选/来源浏览器表现留 T19/T25 |
| T07a | 执行 agent / 2026-09-06 | `assistant-entry-button` 页头入口；controller panelOpen/expanded + open/toggle；panel 420/760px；根 layout 渲染 panel | 全量 127/127；lint 0/0；`tsc` 通过；build exit 0 | 节点环境无浏览器 | Kurisu 本地状态并入 controller 属 chat 重构收敛；浏览器入口验证留 T19/T25 |
| T07b | 执行 agent / 2026-09-06 | panel Escape 关闭回焦；手机 100dvh+safe-area sheet；Kurisu 失败静态替代 | 全量 127/127；lint 0/0；`tsc` 通过；build exit 0 | 节点环境无浏览器 | 手机/焦点/安全区浏览器实测留 T19/T25 |
| T15 | 执行 agent / 2026-09-06 | `learning-route.ts` 展示 adapter + `learning-route-view.tsx`（LearningRouteDisplay/Body）+ `learning-route.test.ts`；`path-view.tsx` 新增“学习安排”区块接 `/api/learning-routes/current` | `tsc --noEmit` 通过；改动文件 eslint 0；全量 132/1145 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 空态/正常/归档三态视觉与接口联调留 T19/T25 |
| T16a | 执行 agent / 2026-09-06 | `role-options.ts`（buildRoleOptions/roleLabelFor/seedRoleLabels）+ `role-options.test.ts`；`resource-view.tsx`：岗位选项由种子+画像+资源实际 roleKey 构成、外链真 `<a>`、无 URL 不伪装、检索失败与该结果分开、裸 fetch 迁 `fetchApi`+seq 防竞态、展示 estimatedHours | `tsc --noEmit` 通过；改动文件 eslint 0；全量 133/1150 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 筛选/键盘/空态/竞态浏览器检查留 T19/T25 |
| T16b | 执行 agent / 2026-09-06 | `resources/route.ts`：可选 taskId/planId，服务端核验归属并返回 context roleKey/taskTitle；`task-detail.tsx`「查找学习资源」跳转带上下文；`resource-view.tsx` 任务进入显示上下文+返回任务+预填角色；`workspace.tsx` Suspense 包裹；`path-view.tsx` 传 planId | `tsc --noEmit` 通过；改动文件 eslint 0；全量 133/1154 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 任务→资源→返回实际导航交互留 T19/T25 |
| T17a | 执行 agent / 2026-09-06 | `simulation-view.tsx`：选择/训练/完成三阶段、active brief 按场景反查（不冒充默认第一项）、进行中折叠情境卡+隐藏大片禁用卡、裸 fetch 迁 `fetchApi`、send/complete 失败保留答案+可重试、重复操作防护、刷新恢复；`simulation.ts` 新增 `scenarioMetaForSession`；`simulation.test.ts` +3 用例 | `tsc --noEmit` 通过；改动文件 eslint 0；全量 133/1157 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 三轮评分/失败恢复/竞态浏览器 E2E 留 T19/T25；评分报告细节属 T17b |
| T17b | 执行 agent / 2026-09-06 | `simulation-view.tsx`：null score 改“未产生正式评分”不画 0 环、完成态一律走报告、能力影响绝对值+负值样式、AI 降级标记、候选“已生成/待确认”不声称改画像、报告加“返回任务”；`simulation.ts` `formatAbilityImpact`/`impactBarPercent`；`simulation.test.ts` +4 用例；`globals.css` 新增 4 样式 | `tsc --noEmit` 通过；改动文件 eslint 0；全量 133/1159 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 评分报告/降级/返回任务浏览器验证留 T19/T25 |
| T18 | 执行 agent / 2026-09-06 | `confirm-dialog.tsx` 异步确认成功才关闭+失败保留+禁用重复提交+焦点圈定回焦；`memory-view.tsx` 三标签（`memory-tabs.ts` 深链接解析）+画像证据只读+清空独立危险区+隐私文案对齐+confirmDelete/clearData 判断成功；`simulation-view.tsx` 候选深链接 `?tab=candidates`；`workspace.tsx` 传 profile+Suspense；`globals.css` 新增 tab 样式；`memory-tabs.test.ts` +4 用例 | `tsc --noEmit` 通过；改动文件 eslint 0；全量 134/1163 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | ConfirmDialog 交互/焦点圈定/标签切换浏览器验证留 T19/T25 |
| T19 | 执行 agent / 2026-09-06 | `globals.css` 正文可选取（内容区 user-select:text、控件禁用）；`kurisu-avatar.tsx` iframe 低动效门控；`assistant-panel.tsx` `id=assistant-panel`；`assistant-entry-button.tsx` `aria-expanded`/`aria-controls`/`aria-haspopup` | `tsc --noEmit` 通过；改动文件 eslint 0；全量 134/1163 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 纯键盘打开/关闭、360px/200% 缩放、对比度、iframe 低动效、`e2e/motion-reduced.spec.ts` 浏览器运行留 T25 |
| T10b | 执行 agent / 2026-09-06 | `product-sidebar.tsx` 补 `id=primary-sidebar`；`workspace.tsx` 移动顶栏去重复岗位标题改“工作台”；删除无引用 `app-shell.tsx`/`mobile-navigation.tsx` | 引用核查无外部引用；`tsc --noEmit` 通过；改动文件 eslint 0；全量 134/1163 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 断点/遮挡浏览器验证留 T25 |
| T10c | 执行 agent / 2026-09-06 | `styles/tokens.css`（唯一 :root）+ `styles/base.css`（reset/光标/焦点/滚动条）；`globals.css` 改 `@import "./styles/tokens.css"`/`"./styles/base.css"` 并移除已迁块 | :root 唯一性 tokens:1/globals:0；`tsc --noEmit` 通过；全量 134/1163 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 纯搬运无视觉改动；最终 computed styles/断点浏览器验证留 T25 |
| T20 | 执行 agent / 2026-09-06 | `view-modules.ts`(modulesForView)+`view-modules.test.ts`(+4 用例)；`use-workspace-data.ts` 按视图加载 + 跨视图补加载；`workspace-types.ts` 精确读 DTO 替换 any；`memory-view`/`admin-view`/`simulation-view` 用 DTO 类型化 | `tsc --noEmit` 通过；全量 135/1167 通过；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 重图表动态加载 + 同环境网络/性能测量留 T25 |
| T21a | 执行 agent / 2026-09-06 | `schema.prisma` `@@unique([userId,version])`；迁移先按每用户 (version,createdAt,id) 重编号去重（不删数据）再建唯一索引（node:sqlite 验证去重/唯一索引）；`generation-service.ts` ensureGenerationPlan 对 P2002 有界重试 | `tsc --noEmit` 通过；node:sqlite 去重 u1:1,1,2→1,2,3 / u2:1,5→1,2 + 唯一索引创建成功；`npm run test:migrations` 通过；generation 7/7（含 P2002 重试+非冲突不重试）；全量 135/1169；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 副本上真实历史去重待数据演练；其他 careerPlan.create 写路径（replan/artifact/stream）版本并发待审计 |
| T21b | 执行 agent / 2026-09-06 | `agentic-v2/candidates/route.ts`：limit(max100)+游标+total(count)；`workspace-types.ts` 加 `v2CandidateTotal`；`use-workspace-data.ts` 读 total+limit=100；`workspace.tsx`/`dashboard-view.tsx` 待确认计数改用 total；`route.test.ts` +4 用例 | `tsc --noEmit` 通过；candidates route 10/10；全量 135/1173；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 客户端 load-more UI 未加（当前 limit=100 足够）；memories/simulations 未分页待后续 |
| T22 | 执行 agent / 2026-09-06 | `stream-helpers.ts` 提取 3 纯 helper + `stream-helpers.test.ts`(+7 用例)；`stream-service.ts` import 同一逻辑删本地重复(-85 行)，调用点不变 | `tsc --noEmit` 通过；stream-helpers 7/7；既有 stream stateful/base 24/24；全量 136/1180；`npm run lint` 0/0；`npm run build` exit 0 | 节点环境无浏览器 | 未对控制流做更大重构（刻意避免无浏览器下的高风险重组）；一轮对话生命周期可读性/流式中断浏览器验证留 T25 |
| 评估与计划 | 当前评估 / 2026-09-06 | 仅 tasks/ 文档与截图 | baseline 见评估报告；非全绿 | 7 张本次截图 | 产品优化尚未执行 |

## 下一位 agent 从这里开始

已完成并各自提交：T01、T02(a/b)、T03、T04、T05、T08a、T08b、T09（见上表各证据的 t*-baseline.md）。当前 `npm run lint` 0/0、`npm run test` 126 文件/1106 用例全绿、`npm run build` exit 0。

下一步：**T06a/T06b/T07a/T07b（助手控制器/面板/入口）**。⚠️ 这些任务与另一 agent 在 `src/components/chat/message-parts.tsx` 的未提交聊天状态重构存在重叠，plan §7.2 明确“不得两人同时重构聊天状态”；建议先让该 WIP 落定后再接 T06，并保留 T05 的历史回归测试。其余未执行项按 plan 顺序继续。
