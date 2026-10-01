---
name: CareerMate职业证据解析
description: 将画像、成长历史、职业基线与市场调研中的结构化事实整理为去重、脱敏的职业证据。用于画像评估、职业探索和规划前的证据整理；不用于联网、PDF/Word解析、生成建议或写入正式数据。
---

# CareerMate职业证据解析

## 当前实现

源码校准日期：2026-10-01。核心函数为 `parser.ts` 的 `parseEvidenceBundle`，输入 Schema 和输出类型见 `schema.ts`。它从四路结构化材料中提取已支持的字段，不能凭空补出材料未提供的经历、市场来源或业务事实。

`profileSnapshot.data` 当前提取能力评分、学习偏好、约束和目标职业名称；`historySnapshot.data` 支持历史条目数组，或包含活动计划、近期进度和已完成训练的对象。职业基线从 `careerBaseline.evidence`/职业键读取，市场证据从 `marketEvidence.findings` 和对象形式的冲突说明读取。输出中的来源类别区分个人与外部证据，但不自动核验原始来源，也不是对任意文档字段的通用解析器。

## 可复现输入

以下是合成结构示例，仅用于独立 Skill CLI；它不是更严格的平台工作流输入示例。使用一个新 CLI 进程执行，可得到下一节的完整输出。

```json
{
  "evidenceBundle": {
    "schemaVersion": "1.0",
    "request": {
      "taskType": "career_exploration"
    },
    "profileSnapshot": {
      "available": true,
      "version": 3,
      "data": {
        "abilityScores": {
          "dataAnalysis": 60
        },
        "learningPreference": [
          "项目练习"
        ],
        "constraints": [
          "每周可投入 6 小时"
        ],
        "targetRoleLabel": "数据分析师"
      }
    },
    "historySnapshot": {
      "available": true,
      "through": null,
      "data": {
        "activePlan": {
          "targetRoleLabel": "数据分析师",
          "version": 2
        }
      }
    },
    "careerBaseline": {
      "available": false,
      "roleKey": null,
      "templateVersion": null,
      "evidence": []
    },
    "marketEvidence": {
      "searched": false,
      "skipReason": "示例未请求公开市场信息",
      "collectedAt": null,
      "scope": {},
      "findings": [],
      "sources": [],
      "conflicts": [],
      "confidence": "low"
    }
  }
}
```

## 对应完整输出

以下输出由当前 `cli.ts` 实际执行上面的输入获得；`parsedAt` 使用执行时刻，复验时该值会变化。证据 ID 使用进程内递增计数，同一进程多次调用的 ID 不保证从 001 重置。

```json
{
  "schemaVersion": "1.0",
  "parsedAt": "2026-10-01T11:39:04.604Z",
  "totalItems": 5,
  "items": [
    {
      "id": "profile-001",
      "source": "profile",
      "type": "ability_score",
      "confidence": 0.9,
      "rawQuote": "dataAnalysis: 60",
      "normalizedClaim": "用户自评 dataAnalysis 能力 60/100",
      "conflicts": []
    },
    {
      "id": "profile-002",
      "source": "profile",
      "type": "preference",
      "confidence": 0.9,
      "rawQuote": "项目练习",
      "normalizedClaim": "学习偏好: 项目练习",
      "conflicts": []
    },
    {
      "id": "profile-003",
      "source": "profile",
      "type": "constraint",
      "confidence": 0.9,
      "rawQuote": "每周可投入 6 小时",
      "normalizedClaim": "时间/资源约束: 每周可投入 6 小时",
      "conflicts": []
    },
    {
      "id": "profile-004",
      "source": "profile",
      "type": "preference",
      "confidence": 0.95,
      "rawQuote": "数据分析师",
      "normalizedClaim": "目标职业: 数据分析师",
      "conflicts": []
    },
    {
      "id": "history-005",
      "source": "history",
      "type": "plan",
      "confidence": 0.85,
      "rawQuote": "计划 数据分析师 状态: active，版本 2",
      "normalizedClaim": "计划 数据分析师 状态: active，版本 2",
      "conflicts": []
    }
  ],
  "summary": {
    "bySource": {
      "profile": 4,
      "history": 1
    },
    "byType": {
      "ability_score": 1,
      "preference": 2,
      "constraint": 1,
      "plan": 1
    },
    "conflictCount": 0,
    "averageConfidence": 0.9
  }
}
```

## 处理规则与边界

1. 四路证据分别提取，再按归一化声明的内容哈希去重；相同声明只保留置信度较高的一项，不保证重复声明仍保留每一路来源。
2. 数字/百分数和 high、medium、low 归一化为 0–1 的置信度。这是程序转换或固定提取权重，不是事实可靠性检验。
3. 冲突标记使用有限的文本键规则，不能证明两个声明在事实层面冲突；输出需由后续流程结合原材料解释。
4. `stripPII` 用正则替换中国手机号、身份证格式、邮箱，以及带特定引导词的中文姓名和地址。姓名/地址检测依赖文本格式，不保证识别所有 PII；上游仍需先按权限裁剪、脱敏。
5. 非法输入会尝试宽容提取，可能返回空列表；不能把返回 JSON 就视为输入材料完整或符合平台任务契约。
6. 核心函数不联网、不读写数据库或文件、不修改传入业务对象；CLI 只读取指定文件或 stdin 并输出 JSON。时间戳和进程内 ID 计数会随调用变化。

## 执行方式

平台包由 `npm run package:skills` 生成，ZIP 内已打包依赖：

```bash
node run.mjs input.json
node run.mjs < input.json
```

仓库已安装依赖时也可直接调用源码 CLI：

```bash
node node_modules/tsx/dist/cli.mjs src/agentic-v2/skills/evidence-parser/cli.ts input.json
```

主 Agent 优先解释后端 `evidenceBundle.verifiedAnalysis`，只有缺少必要补充结果时才按需调用平台 Skill。`validate.mjs` 会执行合成样例，但通过仅证明这些样例可运行，不证明平台真实调用、来源事实或完整业务验收。

## 版本

- 版本：1.0.0
- 说明校准日期：2026-10-01
- 适用方式：本地核心函数、仓库 CLI、百宝箱 Skill 包
