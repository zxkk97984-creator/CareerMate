#!/usr/bin/env node
/**
 * CareerMate职业证据解析 Skill — 独立验证脚本
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

// ---- 工具函数 ----

const PII_PATTERNS = [
  { name: "手机号", pattern: /1[3-9]\d{9}/g },
  { name: "身份证号", pattern: /\d{17}[\dXx]/g },
  { name: "邮箱", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
];

function checkPII(text) {
  const found = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) found.push(`${name}: ${matches.join(", ")}`);
  }
  return found;
}

// ---- 验证器 ----

const validators = {
  normal(input) {
    const errors = [];
    const bundle = input.evidenceBundle;
    if (!bundle.profileSnapshot) errors.push("缺少 profileSnapshot");
    if (!bundle.marketEvidence?.findings) errors.push("缺少 marketEvidence.findings");
    if (bundle.marketEvidence?.searched !== true) errors.push("marketEvidence.searched 应为 true");
    if (!bundle.careerBaseline?.evidence?.length) errors.push("careerBaseline.evidence 不应为空");
    return errors;
  },

  empty(input) {
    const errors = [];
    const bundle = input.evidenceBundle;
    if (bundle.profileSnapshot?.available !== false) errors.push("profile 应为 unavailable");
    if (bundle.historySnapshot?.available !== false) errors.push("history 应为 unavailable");
    if (bundle.marketEvidence?.searched !== false) errors.push("market 应为未搜索");
    if (!bundle.marketEvidence?.skipReason) errors.push("market 缺少 skipReason");
    return errors;
  },

  corrupt(input) {
    const errors = [];
    const bundle = input.evidenceBundle;
    // 验证即便输入损坏也能解析
    if (!bundle) errors.push("evidenceBundle 缺失");
    if (typeof bundle?.profileSnapshot?.available === "string") {
      // 损坏输入 - 这是预期的
    } else {
      errors.push("示例应为损坏的 available 字段");
    }
    return errors;
  },

  sensitive(input) {
    const errors = [];
    const json = JSON.stringify(input);
    const piiFound = checkPII(json);
    // 原始输入应有 PII（这样才能验证脱敏）
    if (piiFound.length === 0) {
      errors.push("敏感示例应包含 PII 数据用于脱敏验证");
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

  // 1. 有效的 JSON
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    console.log(`  ❌ JSON 解析失败: ${err.message}`);
    return false;
  }
  console.log("  ✅ JSON 解析成功");

  // 2. 有 evidenceBundle
  if (!input.evidenceBundle) {
    console.log("  ❌ 缺少 evidenceBundle");
    return false;
  }
  console.log("  ✅ evidenceBundle 存在");

  // 3. 特定验证器
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

  // 4. 检查 PII（sensitive 示例除外）
  if (name !== "sensitive") {
    const json = JSON.stringify(input);
    const piiFound = checkPII(json);
    if (piiFound.length > 0) {
      console.log(`  ⚠️  非敏感示例检测到 PII: ${piiFound.join("; ")}`);
    } else {
      console.log("  ✅ 无 PII 泄露");
    }
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
