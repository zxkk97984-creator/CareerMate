---
name: CareerMate成长数据分析
description: 对已脱敏的计划、任务、能力评分与模拟训练记录进行确定性统计，输出完成率、能力趋势、时间趋势和薄弱项。用于成长复盘和重规划的解释依据；不用于联网、推断性格、生成最终建议或写入正式数据。
---

# CareerMate成长数据分析

## 当前实现

源码校准日期：2026-10-01。核心函数为 `analyzer.ts` 的 `analyzeGrowthData`，输入/输出 Schema 见 `schema.ts`。它分析调用方明确提供的结构化记录，不自动读取数据库，不把缺少记录解释成能力下降。

## 可复现输入

以下合成数据仅说明独立 Skill CLI。示例只有当前能力分数、一个已完成计划、一次学习进度和一次已评分训练，没有历史能力评分；因此不能推断能力上涨或训练表现正在改善。`python`/`sql` 是这个独立统计器可接受的示例键，不是本地画像六维评分接口的字段清单。

```json
{
  "profileSnapshot": {
    "available": true,
    "data": {
      "abilityScores": {
        "python": 65,
        "sql": 55
      },
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
  ],
  "historicalScores": []
}
```

## 对应完整输出

以下输出由当前 `cli.ts` 实际执行上面的输入获得；`analyzedAt` 使用执行时刻，复验时该值会变化。示例的一次训练与缺少历史评分都返回 `insufficient_data`，计划完成率为 1，最长连续训练天数为 1，事件不足时一致性评分为 null。

```json
{
  "schemaVersion": "1.0",
  "analyzedAt": "2026-10-01T11:39:04.777Z",
  "trends": {
    "abilityChanges": [
      {
        "abilityKey": "python",
        "initialScore": 65,
        "currentScore": 65,
        "delta": 0,
        "direction": "insufficient_data",
        "dataPoints": 1
      },
      {
        "abilityKey": "sql",
        "initialScore": 55,
        "currentScore": 55,
        "delta": 0,
        "direction": "insufficient_data",
        "dataPoints": 1
      }
    ],
    "planCompletionRate": 1,
    "totalCompletedPlans": 1,
    "totalActivePlans": 0,
    "totalArchivedPlans": 0,
    "simulationProgress": [
      {
        "scenarioKey": "tech_interview",
        "bestScore": 72,
        "attempts": 1,
        "trend": "insufficient_data"
      }
    ],
    "continuousTrainingDays": 1,
    "totalProgressEvents": 1,
    "weaknesses": []
  },
  "summary": {
    "overallDirection": "insufficient_data",
    "strongAreas": [],
    "weakAreas": [],
    "consistencyScore": null
  }
}
```

## 统计规则

1. 能力变化比较当前分数与最早的 `historicalScores`；没有历史评分时方向为 `insufficient_data`。差值大于 5 判 up，小于 -5 判 down，其余判 stable。
2. 计划完成率为 `completed` 计划数 / 所有输入计划数；没有计划为 null。`archived` 单独计数，不能视为完成。
3. 训练统计只使用 `status=completed` 且 `score` 非 null 的记录，按场景汇总最佳分数和次数；同场景不足两次有效评分时趋势为 `insufficient_data`。
4. 连续训练天数是有效学习事件与已评分训练日期的最长连续天数，不是一定延续到今天的当前连续天数。学习事件包括 task_completed、simulation_completed，以及说明完成状态的 task_status_updated；进度按 ID 去重后计数。
5. 当前分数低于 45 标记薄弱项，达到 70 标记优势；没有当前评分不生成对应项。该规则不根据岗位市场要求自动评分。
6. 一致性评分需要至少三个事件时间点且有非零平均间隔，否则为 null。整体方向按已有 up/down 能力项计数，不从一次训练或完成率推断长期改善。
7. 输入必须通过 Schema，非法数据抛出 `GrowthAnalyzerInputError`；CLI 返回错误 JSON 并以非零状态退出。

## 本地适配范围与隐私

`src/lib/agentic-v2/verified-analysis.ts` 已直接调用此核心函数，当前只传入活动计划、近期进度及已完成训练，`historicalScores` 为空；不能将该适配结果描述为包含所有历史计划或已经测出长期能力提升。

核心函数不联网、不写入数据库或文件，不生成新的职业建议。调用前由上游裁剪、脱敏；`detectSensitiveFields` 是独立的格式提示函数，主分析入口没有调用它，不保证自动拒绝所有敏感信息。

## 执行方式

平台包由 `npm run package:skills` 生成，ZIP 内已打包依赖：

```bash
node run.mjs input.json
node run.mjs < input.json
```

仓库已安装依赖时可直接调用源码 CLI：

```bash
node node_modules/tsx/dist/cli.mjs src/agentic-v2/skills/growth-analyzer/cli.ts input.json
```

主 Agent 优先解释 `evidenceBundle.verifiedAnalysis`，按需补充调用平台 Skill。`validate.mjs` 会执行核心 CLI 并检查样例（含非法输入），通过仅证明这些合成输入的执行结果，不能证明平台挂载或完整业务已验收。

## 版本

- 版本：1.0.0
- 说明校准日期：2026-10-01
- 适用方式：本地核心函数、仓库 CLI、百宝箱 Skill 包
