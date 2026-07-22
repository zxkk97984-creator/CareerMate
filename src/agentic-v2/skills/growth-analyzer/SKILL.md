---
name: CareerMate成长数据分析
description: 对已脱敏的计划、任务、能力评分与模拟训练记录进行确定性统计，输出完成率、能力趋势、时间趋势、计划偏差与异常依据。用于成长复盘和重规划；不用于联网、推断性格、生成最终建议或写入正式数据。
---

# CareerMate成长数据分析

## 概述

分析用户职业成长数据，从画像快照、历史计划、进度日志和模拟训练记录中提取趋势、计算关键指标并标记薄弱项。不做判断或建议，只产出标准化量化数据。

## 输入

```json
{
  "profileSnapshot": {
    "available": true,
    "version": 3,
    "data": {
      "abilityScores": { "python": 65, "sql": 55 },
      "targetRole": "data_analyst"
    }
  },
  "planHistory": [
    {
      "id": "plan-1",
      "targetRole": "data_analyst",
      "status": "completed",
      "currentMonthIndex": 6,
      "version": 1,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-06-30T00:00:00.000Z"
    }
  ],
  "progressLogs": [
    {
      "id": "log-1",
      "eventType": "task_completed",
      "title": "完成 Python 基础课程",
      "createdAt": "2026-02-15T00:00:00.000Z"
    }
  ],
  "simulations": [
    {
      "id": "sim-1",
      "scenarioKey": "tech_interview",
      "score": 72,
      "status": "completed",
      "turnCount": 4,
      "createdAt": "2026-03-01T00:00:00.000Z"
    }
  ]
}
```

## 输出

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "2026-07-22T00:00:00.000Z",
  "trends": {
    "abilityChanges": [
      { "abilityKey": "python", "initialScore": 40, "currentScore": 65, "delta": 25, "direction": "up", "dataPoints": 3 }
    ],
    "planCompletionRate": 0.75,
    "totalCompletedPlans": 1,
    "totalActivePlans": 0,
    "simulationProgress": [
      { "scenarioKey": "tech_interview", "bestScore": 72, "attempts": 1, "trend": "improving" }
    ],
    "continuousTrainingDays": 14,
    "totalProgressEvents": 12,
    "weaknesses": ["sql", "dataVisualization"]
  },
  "summary": {
    "overallDirection": "improving",
    "strongAreas": ["python", "statistics"],
    "weakAreas": ["sql", "dataVisualization"],
    "consistencyScore": 0.68
  }
}
```

## 功能

1. **能力变化计算** — 对比能力评分的历史变化（需要至少两个数据点）
2. **计划完成率** — 已完成计划数 / 总计划数
3. **模拟训练进步** — 按场景聚合最佳分数和尝试次数
4. **连续训练天数** — 从进度日志计算最长连续打卡天数
5. **薄弱项标记** — 分数低于阈值或进步缓慢的能力
6. **一致性评分** — 0-1 衡量学习节奏的规律性

## 约束

- 不发起网络请求
- 不写入数据库或文件系统
- 不推断用户性格、情绪或潜力
- 不生成建议或评价性文本
- 不读取其他用户的数据
- 所有输入中的敏感信息应在调用前由上游脱敏

## 使用方式

在工作流中作为数据分析节点，接收上游（如 MCP 工具或职业证据解析 Skill）提供的结构化数据，产出量化趋势指标供后续节点（如画像评估、学习路线、成长复盘）消费。

## 版本

- 版本：1.0.0
- 更新日期：2026-07-22
- 适用平台：百宝箱 Skill 节点
