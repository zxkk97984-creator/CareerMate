# CareerMate职业证据解析

## 概述

将多来源职业证据（用户画像、成长历史、职业基线、市场调研）解析为标准化的结构化证据列表。每条证据标记来源、类型、置信度、原始引用和标准化声明，发现并标记冲突。

## 输入

```json
{
  "evidenceBundle": {
    "schemaVersion": "1.0",
    "request": { "action": "career_exploration" },
    "profileSnapshot": { "available": true, "version": 7, "data": { } },
    "historySnapshot": { "available": true, "through": "msg-9", "data": [] },
    "careerBaseline": { "roleKey": "data_analyst", "templateVersion": "2026.07", "evidence": [] },
    "marketEvidence": { "searched": true, "skipReason": null, "collectedAt": "...", "scope": {}, "findings": [], "sources": [], "conflicts": [], "confidence": "medium" }
  }
}
```

## 输出

```json
{
  "schemaVersion": "1.0",
  "parsedAt": "2026-07-22T00:00:00.000Z",
  "totalItems": 5,
  "items": [
    {
      "id": "ev-001",
      "source": "profile",
      "type": "ability_score",
      "confidence": 0.9,
      "rawQuote": "数据分析: 60",
      "normalizedClaim": "用户自评数据分析能力 60/100",
      "conflicts": []
    }
  ],
  "summary": {
    "bySource": { "profile": 2, "history": 1, "baseline": 1, "market": 1 },
    "byType": { "ability_score": 2, "progress": 1, "requirement": 1, "market_trend": 1 },
    "conflictCount": 0,
    "averageConfidence": 0.75
  }
}
```

## 功能

1. **解析** — 从四路证据分别提取证据项
2. **去重** — 按内容哈希合并重复证据
3. **冲突标记** — 同一能力的不同来源评分互相引用
4. **置信度归一化** — 统一为 0-1 浮点数
5. **敏感信息脱敏** — 移除姓名、手机号、身份证号、邮箱、家庭地址

## 约束

- 不发起网络请求
- 不写入数据库或文件系统
- 不修改传入数据
- 仅解析和标准化，不做判断或建议
- PII 检测使用正则模式匹配，不调用外部 API

## 使用方式

在百宝箱工作流或 Agent 中作为 Skill 节点调用，将大模型输出或 MCP 返回的原始证据转换为结构化列表，供后续工作流节点（如伦理审查、候选生成）消费。

## 版本

- 版本：1.0.0
- 更新日期：2026-07-22
- 适用平台：百宝箱 Skill 节点
