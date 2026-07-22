#!/usr/bin/env node
/**
 * CareerMate成长数据分析 Skill — 独立验证脚本
 *
 * 用法: node validate.mjs [示例名]
 * 示例: node validate.mjs normal
 *       node validate.mjs empty
 *       node validate.mjs corrupt
 *       node validate.mjs sensitive
 *       node validate.mjs          # 运行全部
 *
 * 不依赖 Vitest、Zod 或 TypeScript，纯 Node.js ES module 验证。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "examples");

// ---- 验证器 ----

const validators = {
  normal(input) {
    const errors = [];
    if (!input.profileSnapshot?.data?.abilityScores) {
      errors.push("正常输入应有 abilityScores");
    }
    if (!Array.isArray(input.planHistory) || input.planHistory.length === 0) {
      errors.push("正常输入应有计划历史");
    }
    if (!Array.isArray(input.progressLogs) || input.progressLogs.length === 0) {
      errors.push("正常输入应有进度日志");
    }
    if (!Array.isArray(input.simulations) || input.simulations.length === 0) {
      errors.push("正常输入应有模拟训练记录");
    }
    return errors;
  },

  empty(input) {
    const errors = [];
    if (!Array.isArray(input.planHistory) || input.planHistory.length > 0) {
      errors.push("空输入 planHistory 应为空数组");
    }
    if (!Array.isArray(input.progressLogs) || input.progressLogs.length > 0) {
      errors.push("空输入 progressLogs 应为空数组");
    }
    if (!input.profileSnapshot || input.profileSnapshot.available !== false) {
      errors.push("空输入 profile 应为 unavailable");
    }
    return errors;
  },

  corrupt(input) {
    const errors = [];
    if (typeof input.profileSnapshot?.available === "string") {
      // 预期的损坏数据
    } else {
      errors.push("损坏示例应包含类型错误字段");
    }
    if (Array.isArray(input.historicalScores)) {
      errors.push("historicalScores 应为非数组（损坏）");
    }
    return errors;
  },

  sensitive(input) {
    const errors = [];
    const json = JSON.stringify(input);
    // 应包含敏感信息用于验证
    const hasPhone = /1[3-9]\d{9}/.test(json);
    const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(json);
    if (!hasPhone && !hasEmail) {
      errors.push("敏感示例应包含手机号或邮箱用于验证");
    }
    return errors;
  },
};

// ---- 主流程 ----

function validateExample(name) {
  const filePath = join(examplesDir, `${name}.json`);
  console.log(`\n=== 验证示例: ${name} ===`);

  let raw;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.log(`  ❌ 无法读取文件: ${err.message}`);
    return false;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    console.log(`  ❌ JSON 解析失败: ${err.message}`);
    return false;
  }
  console.log("  ✅ JSON 解析成功");

  // 结构检查
  const hasProfile = "profileSnapshot" in input;
  const hasPlans = Array.isArray(input.planHistory);
  const hasLogs = Array.isArray(input.progressLogs);
  const hasSims = Array.isArray(input.simulations);
  const hasScores = Array.isArray(input.historicalScores);

  if (hasProfile && hasPlans && hasLogs && hasSims && hasScores) {
    console.log("  ✅ 结构完整");
  } else {
    const missing = [];
    if (!hasProfile) missing.push("profileSnapshot");
    if (!hasPlans) missing.push("planHistory(数组)");
    if (!hasLogs) missing.push("progressLogs(数组)");
    if (!hasSims) missing.push("simulations(数组)");
    if (!hasScores) missing.push("historicalScores(数组)");
    console.log(`  ⚠️  缺少字段: ${missing.join(", ")}`);
  }

  // 特定验证
  const validate = validators[name];
  if (validate) {
    const errors = validate(input);
    if (errors.length > 0) {
      console.log(`  ❌ 内容验证失败:`);
      for (const err of errors) console.log(`     - ${err}`);
      return false;
    }
    console.log("  ✅ 内容验证通过");
  }

  return true;
}

// ---- 入口 ----

const target = process.argv[2];
const examples = target
  ? [target]
  : readdirSync(examplesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));

let allPassed = true;
for (const name of examples) {
  const passed = validateExample(name);
  if (!passed) allPassed = false;
}

console.log(`\n${"=".repeat(40)}`);
if (allPassed) {
  console.log("🎉 全部验证通过！");
  process.exit(0);
} else {
  console.log("❌ 部分验证失败，请检查上方输出");
  process.exit(1);
}
