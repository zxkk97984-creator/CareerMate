# 百宝箱知识库配置

## 一、职业知识库 (roleCompetency)

**Dataset Key:** `TBOX_DATASET_ROLE_COMPETENCY`

**内容：**
- 三个已核验岗位的完整资料（AI产品经理、数据分析师、AIGC内容运营）
- 每个岗位：职责、核心能力、入门路径、市场信号、学习建议
- 来源标记：官方职业标准、行业协会报告、企业岗位描述

## 二、学习资源库 (learningResources)

**Dataset Key:** `TBOX_DATASET_LEARNING_RESOURCES`

**内容：**
- 课程推荐（按能力维度和阶段分类）
- 实践项目建议
- 认证考试信息
- 学习路径模板

## 三、训练场景库 (simulationScenes)

**Dataset Key:** `TBOX_DATASET_SIMULATION_SCENES`

**内容：**
- 面试场景（技术面、行为面、案例面）
- 沟通场景（跨部门协作、汇报演讲）
- 评估标准和反馈模板

## 四、伦理规则库 (ethicsRules)

**Dataset Key:** `TBOX_DATASET_ETHICS_RULES`

**内容：**
- 隐私保护规则
- 记忆管理策略
- 候选确认流程
- 数据导出和删除规范

## 五、职业趋势库 (careerTrends)

**Dataset Key:** `TBOX_DATASET_CAREER_TRENDS`

**内容：**
- 行业趋势报告
- 岗位需求变化
- 薪资水平参考

> **使用说明**: 仅用于显式诊断或 `hybrid` 检索模式。静态资料不得宣称为"实时市场"。静态资料仅作背景参考，不能替代实时联网调研。

---

**配置状态**: 前四个知识库已确认配置；`careerTrends` 为目标配置，平台侧实际 dataset ID 待确认。

**每条材料记录：** 来源名称、版本号、上传日期
