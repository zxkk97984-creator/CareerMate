# 百宝箱资源绑定与发布操作

校准日期：2026-10-01。本文是导出脚本读取的操作说明，依据当前源码描述如何生成和验证交付物，不代表平台已配置或已发布。先保留旧发布版本，在草稿中核对资源与参数。

## 从源码生成交付

仓库要求 Node.js 22 或 24；先按根 README 安装锁文件依赖，再执行：

```bash
npm run tbox:bundle
npm run package:skills
```

`tbox:bundle` 默认输出 `artifacts/tbox-delivery/`，可通过 `npm run tbox:bundle -- --out-dir <目录>` 指定位置。目录含三份 Agent 指令、八个工作流的完整提示词/代码/绑定步骤和合成输入输出样例、`00-绑定与发布说明.md`、`careermate-tbox-bundle.txt` 与 `manifest.json`。它从当前工作区生成，不自动固定 Git 提交或推送平台；manifest 的 `bindingVerifiedOnPlatform=false` 和文件哈希分别表示尚未核验平台绑定与生成文件的内容校验。

`package:skills` 另在 `dist/skills/` 生成两个 Skill ZIP，打包主机需提供 `zip` 命令；ZIP 内的 `run.mjs` 已包含依赖，运行时无需安装。七份知识库在 `src/agentic-v2/knowledge-bases/`，需单独导入平台；Skill ZIP 和知识库不会被 `tbox:bundle` 自动复制到交付目录。

## 先分清三个概念

挂载资源使工具可用；编辑器引用明确业务路由；运行节点记录才证明实际调用。平台自动注入工具参数协议，不需要在主 Prompt 伪造调用 JSON。
以下选择器步骤是仓库保留的操作约定，需在当前平台编辑器核对；本文未在线核验平台 UI 或官方说明的最新版本。资源引用应通过编辑器的资源选择器插入，不手写隐藏 ID。

## 文件应该粘贴到哪里

- agents/主Agent.txt：主应用“人设和指令”。
- agents/研究员V2P.txt：研究员 V2P 的角色指令；只启用夸克含正文插件。
- agents/审查员V2.txt：审查员角色指令；挂载伦理知识库，关闭联网。
- workflows/每个工作流/llm-prompt.txt：对应大模型节点，已合并公共规则、任务规则和输入槽。
- workflows/每个工作流/code-node.js：对应代码节点，已打包 Zod 与当前后端 schema，无需 npm install。
- workflows/每个工作流/绑定步骤.md：给操作者阅读，不粘贴到任何模型。
`careermate-tbox-bundle.txt` 仅便于检索，不要整个复制进主 Agent。代码节点源为 `src/lib/agentic-v2/platform-node.ts`，导出入口是 `exports.main = async (event) => ...`，会解析输入、校验当前后端任务 Schema 并返回 `{ artifact }`；它没有数据库写入能力。

## 已观察过的引用类型

下面格式来自仓库历史平台 Prompt 快照，不是对所有平台版本的通用手写保证。粘贴后若显示普通文本，必须删掉该处并输入 `{` 从资源列表重选，直至呈现平台引用块。

| 类型 | 历史引用形式 | 对应资源 |
|---|---|---|
| 知识库 | `<|knowledge_start|>名称<|knowledge_end|>` | 主应用 7 个 V2 知识库 |
| 插件 | `<|plugin_start|>quark_article_search_content<|plugin_end|>` | 研究员的夸克搜索（含正文） |
| Skill | `<|skill_tool_start|>名称<|skill_tool_end|>` | 职业证据解析、成长数据分析 |
| 子工作流 | `<|subflow_tool_start|>名称<|subflow_tool_end|>` | 原有 7 个 V2 工作流 |
| 子智能体 | `<|subapp_tool_start|>名称<|subapp_tool_end|>` | 研究员 V2P、伦理证据审查员 V2 |

逐项绑定主 Prompt 中的 7 个知识库、8 个工作流、2 个 Skill、2 个子智能体；名称与实际资源逐个核对。七个工作流保留历史引用形式，第八个“V2场景生成”仍用【绑定：工作流 V2场景生成】显式占位：先创建发布，挂载到主应用，再删除占位并用选择器插入真实资源，不推测隐藏 ID。发布前搜索【绑定：和 {{，不允许遗留未处理占位。源文件保留占位不意味着线上一定未绑定；线上状态仍需检查实际发布配置。

## 配置顺序

1. 先更新 8 个工作流草稿，绑定开始→模型→代码→结束，先测无效输入和正常输入；代码节点有 raw + 三个开始参数，共四项输入。
2. 在每个 llm-prompt.txt 末尾用变量选择器替换三个槽；普通 {{request}} 文本不是实际变量绑定。
3. 发布验证过的子工作流。保留旧版本和平台返回的版本标识。
4. 更新 V2P 与审查员，插入各自插件/知识库引用，验证并发布。
5. 主应用更新指令、挂载与引用。主应用直接搜索和内置搜索关闭，研究员夸克含正文开启；重复研究员 V2 只在 V2P 验证后解除挂载，不删除旧应用。
6. 主 Agent 优先解释后端 evidenceBundle.verifiedAnalysis；本地已直接执行两个 Skill 核心函数，平台 Skill 只按需补充。保持并核对实际平台记忆开关，不因提示词限制便声称平台后台提取已禁用。
7. 联调实际 question_prefix/business_data 模式。源码默认 question_prefix；普通 V2 主聊天不发送 history。缺 taskContext/evidenceBundle 是上游传参问题，不能在平台伪造空对象绕过。不要将 provider_history 配置用于声称 V2 已向平台转发历史；普通 V2 对该值仍发送结构化 context。
8. 检查 success 只读结果、pending 候选、needs_input 与 error 的主 Agent 信封，最后发布主应用并记录应用、工作流、子应用版本。

## 最小验收

- 一般咨询不触发整套工具；仅缺个人信息时补问，不先搜索。
- 最新公开信息只有一次研究员搜索；来源不足如实说明。
- 指定学习路线调用到正确工作流，节点可见三个实际输入；某一周超预算返回 error，即使总周期容量充足。
- 自定义沟通场景无 JD 仍能预览；job 场景缺岗位信息才补问。
- 模拟返回 expectedRound 原值；原始 needs_input/error 不被 success 校验覆盖。
- 未绑定变量、非法状态、options 对象、版本冲突均返回标准错误；不回显原始输入。
- 页面需要的 success 报告也有一个 Artifact 信封；候选可保存到独立候选表，但未经决策接口确认和复核不投影到正式数据。
- 平台“执行成功”不是业务验收。记录代码输入输出与后端校验，不用模型自称成功代替证据。
- 检查本地执行元信息 actualMode、source、degraded 和 fallbackReason，排除 manual/mock 降级；一般页面有文字答复不能代替真实 API 验收。

## 限制与回退

本包可在本地验证语法与契约，资源绑定、编辑器粘贴大小上限、平台工具是否实际调用仍须控制台验证。拒绝粘贴时不要删减生成代码；记录限制后适配。失败时恢复上一组验证过的发布版本，不回退数据库、不删除用户数据。
平台节点对新学习路线执行严格周安排检查（任务 id/weekIndex、整数周周期），当前后端能保存这些任务扩展字段；旧路线读取兼容历史数据，不能以旧记录可读证明新生成结果符合严格校验。来源语义是否真实仍需证据核对，Zod 不会自动证明事实。

主 Agent Prompt 要求场景生成调用 V2场景生成，这是平台编排约定；本地推荐/岗位场景预览实际直接构造快照，自定义预览才走生成服务。知识库的背景技能键、难度和时间跨度也不能代替本地六维评分、L1/L2/L3、灵活计划及训练 roundLimit（3–6）的业务契约。平台 Prompt 审查通过不能绕过后端版本/权限/用户确认校验。
