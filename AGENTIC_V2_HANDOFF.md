# CareerMate Agentic V2 — Claude / DeepSeek 续做交接单

更新时间：2026-07-23

## 0. No-Business-MCP 运行时（最新架构）

自 2026-07-23 起，活跃 Agentic V2 聊天路径不再依赖 CareerMate 业务 MCP V2。

### 当前活跃运行时

- **快照传输**：CareerMate 后端在每次请求时加载并消毒用户画像、能力证据、活动计划、近期进度、模拟历史和已确认记忆，以 `business_data.profileSnapshot` 和 `business_data.historySnapshot` 发送给 TBox Agent。
- **不需要 `CAREERMATE_CONTEXT_TOKEN_SECRET`**：活跃 V2 运行时不再签署或验证 context token。该环境变量标记为可选/休眠。
- **`/api/mcp/v2` 为休眠未来基础设施**：代码保留但不被活跃聊天路径依赖。
- **单一 `agent_id`**：仅需 `TBOX_AGENT_ID`；无需 MCP 服务端配置。
- **`search_engine=false`**：有意为之，夸克 MCP 已挂载在 Agent 内部。
- **CareerMate DB 为权威**：后端负责身份、权限、版本、确认和正式写入。
- **TBox 长期记忆**：仅存储低敏感偏好。

### 精确信封协议

候选和模拟结果使用 ONE 精确标签：

```
<CAREERMATE_ARTIFACT>
{"schemaVersion":"1.0", ...}
</CAREERMATE_ARTIFACT>
```

- 绝不解析无标签 JSON 或 Markdown 代码块
- 多个信封 → 拒绝
- 真实 TBox 不返回 `structured` 字段，仅从文本流提取

### 休眠能力（保留但未激活）

- `/api/mcp/v2` 端点
- `careermate-v2-registry.ts` MCP 工具注册表
- `CAREERMATE_CONTEXT_TOKEN_SECRET` 环境变量
- `CAREERMATE_PLUGIN_TOKEN` 及相关 MCP 配置

## 1. 唯一目标

完成一套全新的 `CareerMate职业成长伙伴V2` 百宝箱 Agentic 架构，并与 CareerMate 前后端打通。现有百宝箱应用、工作流、知识库、长期记忆和正式环境一律不修改、不升级、不删除。

工作空间固定为百宝箱“外包”。前端和后端只调用一个 V2 `agent_id`；百宝箱 Agentic 是唯一智能决策中枢，CareerMate 后端是身份、权限、权威数据、版本、确认和正式写入中枢。

## 2. 权威工作位置

```text
仓库原目录：C:\Users\zxk\Documents\AI职业规划\CareerMate
隔离工作树：C:\Users\zxk\Documents\AI职业规划\CareerMate\.worktrees\careermate-agentic-v2
分支：Xiaoxiao/careermate-agentic-v2
基线提交：d052096
当前提交：a181f16
```

必须从隔离工作树继续，不要在原目录或主分支开发。

信息可信度顺序：

1. 当前分支中的实际代码、测试、数据库 Schema 和迁移。
2. 用户明确确认的本交接单与 V2 计划。
3. 本地百宝箱官方文档：`C:\Users\zxk\Documents\AI职业规划\蚂蚁百宝箱企业版文档`。
4. 百宝箱官网当前页面。
5. `CareerMate/docs` 仅为低可信历史材料，不可作为架构真相。

## 3. 已完成且禁止推翻的部分

- V2 HMAC 短时上下文令牌，最长 600 秒；当前聊天令牌为 300 秒。
- 令牌以 `sub` 固定用户、`sid` 固定本地会话，并包含精确 Scope、`iat`、`exp`、`jti`。
- V2 统一契约：四路证据包、Agent Artifact、研究报告和伦理审查报告。
- 通用 V2 候选存储及会话级幂等保护。
- 7 个业务 MCP 工具注册表：
  - `profile.read`
  - `growth_history.read`
  - `career_templates.query`
  - `learning_resources.query`
  - `simulation_state.read`
  - `candidate.create`
  - `simulation_turn.append`
- `/api/mcp/v2`：带鉴权、Origin、请求大小、批量大小和消息种类校验的无状态 Streamable HTTP MCP。
- V2 聊天 `business_data` 只发送签名令牌及有限页面交互上下文。
- `search_engine=false`；V2 只通过挂载的“夸克搜索”MCP 联网。
- 开启 V2 时禁止旧版 Agent Operations 直接写正式数据。
- 百宝箱 `conversation_id` 按 `agent_id + agent_version` 绑定，切换/回滚 Agent 时不会错误复用。
- `CAREERMATE_AGENTIC_V2=false` 可安全回滚到旧行为。
- 已移除构建时 Google Fonts 下载依赖。

当前验证证据：

```text
npm.cmd run lint       通过
npm.cmd run typecheck  通过
npm.cmd test           92 个文件 / 843 项测试通过
npm.cmd run build      通过
npm.cmd run secret:scan 317 个文件通过
git diff --check       通过
代码复审              无 Critical / Important 问题
```

## 4. 不可突破的业务边界

- AI 只能生成画像、证据、分数、计划、学习路线、重规划和记忆的候选。
- 正式数据必须经过后端 Schema/权限/版本校验，并由用户明确确认后写入。
- 不向 Agent 暴露直接覆盖画像、发布计划、删除全部数据、修改已确认分数的工具。
- 页面上下文只能描述 `surface + action`，不能命令调用具体工作流。
- 百宝箱原生 Web 未绑定 CareerMate 登录态时只能做公共咨询。
- 搜索不得发送姓名、联系方式、完整简历、身份信息或无关敏感信息。
- 知识库、个人事实、历史记录、联网证据必须保持来源独立。
- 旧的“百宝箱长期记忆-0514”及其测试数据不迁移到 V2。

## 5. 尚未完成的真实任务

按以下顺序执行，不得把准备资产误报为已经在百宝箱创建成功。

### A. 制作并验证 2 个 Skill ZIP

1. `CareerMate职业证据解析`
2. `CareerMate成长数据分析`

ZIP 根目录必须直接包含 `SKILL.md`。Skill 只做解析、计算和标准化，不联网、不写正式数据。为正常、空、损坏和敏感输入提供自动测试或验证脚本。

### B. 制作 7 个知识库数据集

1. `V2职业能力模板库`（文档）
2. `V2学习资源库`（CSV 表格）
3. `V2训练场景库`（文档）
4. `V2伦理隐私规则库`（文档）
5. `V2职业趋势研究库`（文档，必须带来源和日期）
6. `V2简历作品方法库`（文档）
7. `V2认证机会库`（CSV 表格）

职业可扩展；三个种子职业只用于首轮内容和测试，任何主 Prompt/工作流不得写死只能支持三类职业。

### C. 建立至少 40 条评测数据

覆盖路由、四路证据融合、联网/跳过原因、候选确认、版本冲突、模拟连续性、数据隔离、记忆隔离、敏感信息脱敏、未知职业和新增职业无需改 Prompt 等场景。

### D. 部署公网 CareerMate 业务 MCP V2

- 使用独立预览/测试环境与 HTTPS。
- 配置 V2 令牌密钥和 Origin，不打印或提交密钥。
- 运行两个测试用户的数据隔离、过期令牌、Scope 和跨用户攻击测试。
- 对外端点为 `/api/mcp/v2`。

### E. 只在百宝箱“外包”空间新建资源

依次创建：7 个知识库 → 2 个 MCP → 2 个 Skill → 2 个子智能体 → 7 个工作流 → 1 个 Agentic 主智能体 → 独立自动长期记忆。

两个子智能体：

- `CareerMate职业情报研究员V2`
- `CareerMate伦理证据审查员V2`

七个工作流（名称不超过 10 字）：

- `V2画像评估`
- `V2职业探索`
- `V2职业规划`
- `V2学习路线`
- `V2职场模拟`
- `V2简历作品`
- `V2成长复盘`

主应用：

```text
名称：CareerMate职业成长伙伴V2
类型：Agentic 自主规划
推理模型：DeepSeek-V3.2
多模态模型：Qwen3.5-plus
分段模型：开启
```

所有 Prompt 资源引用必须先挂载资源，再在编辑器输入 `{` 从真实列表选择；不要手敲伪引用。工作流默认只以结束节点“变量消息”返回 `artifact`，避免直接回复、结束节点和主 Agent 三次输出。

### F. 长期记忆与全链路发布

自动记忆只允许稳定、低敏感、长期有用的信息。CareerMate 数据库仍保存正式画像、证据、计划、训练、进度和版本。完成资源级测试及 40 条主 Agent 评测后再发布，并锁定 `agent_version`。

## 6. Claude 与 DeepSeek 的分工

### Claude（总控与最终审查）

- 先读实际代码、`AGENTIC_V2_HANDOFF.md` 和相关官方文档。
- 维护任务清单、接口一致性和“不碰旧资源”边界。
- 审查知识库内容、Skill 说明、子智能体与主 Prompt。
- 负责浏览器中的百宝箱资源创建和资源间真实引用。
- 负责部署决策、密钥边界、全链路测试及最终验收。
- DeepSeek 的任何输出都必须经 Claude 复核后才能进入仓库或百宝箱。

### DeepSeek（边界明确的执行任务）

- 生成知识库初稿、CSV 数据、评测用例和 Skill 脚本。
- 编写明确规格下的代码与测试。
- 修复可复现的测试失败。
- 不独立修改总体架构、权限模型、数据写入边界或部署配置。
- 不直接操作百宝箱现有资源，不接触生产密钥。

推荐每次只下发一个独立任务，并要求返回：改动文件、设计依据、验证命令、验证输出和已知限制。

## 7. Claude 启动提示词

```text
你是 CareerMate Agentic V2 的总控执行者。请在
C:\Users\zxk\Documents\AI职业规划\CareerMate\.worktrees\careermate-agentic-v2
的 Xiaoxiao/careermate-agentic-v2 分支继续工作。

首先完整阅读仓库根目录 AGENTIC_V2_HANDOFF.md，并以实际代码、测试和
C:\Users\zxk\Documents\AI职业规划\蚂蚁百宝箱企业版文档
为权威来源；CareerMate/docs 仅为低可信历史材料。

必须保留：百宝箱 Agentic 是唯一大脑；后端负责身份、权限、正式数据、版本与用户确认；只在“外包”空间新建 V2 资源；不得修改、升级、删除任何旧百宝箱资源。

先执行 git status、git log、npm.cmd run lint、npm.cmd run typecheck、npm.cmd test 和 npm.cmd run build，确认交接基线。随后从交接单第 5 节 A 开始逐项完成。可以把边界明确的数据生成和测试任务交给 DeepSeek，但必须亲自审查，不能让 DeepSeek改变架构、安全边界或正式写入规则。每完成一项都提供可验证证据，不得以文档或意图代替实际创建、部署和测试结果。
```

## 8. DeepSeek 单任务模板

```text
你只负责以下一个明确任务：【填写任务】。

工作目录：C:\Users\zxk\Documents\AI职业规划\CareerMate\.worktrees\careermate-agentic-v2
分支：Xiaoxiao/careermate-agentic-v2

开始前阅读 AGENTIC_V2_HANDOFF.md。不得修改总体架构、权限模型、候选确认边界、旧百宝箱资源或生产配置。不要依赖 CareerMate/docs 推断当前实现。

交付必须包含：
1. 实际改动文件；
2. 与既有契约对齐的说明；
3. 自动验证命令和完整结果；
4. 未完成项和风险；
5. 不得声称未实际执行的测试或平台操作已经完成。
```

## 9. 低成本直接启动方式

如果采用“Claude Code 工具外壳 + DeepSeek 模型后端”，先在当前终端临时设置 `DEEPSEEK_API_KEY`，再执行：

```bat
scripts\start-claude-with-deepseek.cmd --check
scripts\start-claude-with-deepseek.cmd
```

脚本不会保存或打印 API Key。它使用 DeepSeek 官方 Anthropic 兼容端点，主任务映射到 `deepseek-v4-pro[1m]`，子任务映射到 `deepseek-v4-flash`。

这种模式下，Claude Code 只是代理工具外壳，真正推理模型是 DeepSeek；它不等于 Anthropic Claude 与 DeepSeek 的双模型协作。若要真正双供应商编排，需要额外路由层，当前项目不采用该复杂方案。
