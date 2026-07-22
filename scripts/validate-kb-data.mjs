#!/usr/bin/env node
/**
 * 知识库数据验证脚本
 *
 * 用法: node scripts/validate-kb-data.mjs [目录路径]
 * 默认扫描 src/agentic-v2/knowledge-bases/
 *
 * 检查项：
 * 1. 必填字段缺失
 * 2. 枚举值合法性
 * 3. 重复记录
 * 4. URL 格式
 * 5. 日期格式
 * 6. 时效性（validUntil 过期）
 * 7. 职业扩展能力（roleKey 覆盖）
 * 8. 敏感信息（PII）
 * 9. 空内容/空白字段
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultDir = join(__dirname, "..", "src", "agentic-v2", "knowledge-bases");

// ---- 配置 ----

const ALLOWED_STAGES = ["entry", "junior", "mid", "senior", "expert", "all"];
const ALLOWED_RESOURCE_TYPES = [
  "course",
  "book",
  "project",
  "certification",
  "tutorial",
  "article",
  "video",
  "tool",
  "community",
  "other",
];
const ALLOWED_DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"];
const URL_PATTERN = /^https?:\/\/.+/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PII_PATTERNS = [
  { name: "手机号", pattern: /1[3-9]\d{9}/g },
  { name: "身份证号", pattern: /\d{17}[\dXx]/g },
  { name: "邮箱", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
];

const CSV_REQUIRED_COLUMNS = [
  "roleKey",
  "abilityKey",
  "stage",
  "resourceType",
  "difficulty",
  "duration",
  "source",
  "updatedAt",
  "validUntil",
];

const REPORT = { errors: [], warnings: [] };

// ---- 工具函数 ----

function addError(file, line, message) {
  REPORT.errors.push({ file, line, message });
}

function addWarning(file, line, message) {
  REPORT.warnings.push({ file, line, message });
}

function parseCSV(content, filePath) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    addError(filePath, 1, "CSV 文件为空或只有表头");
    return null;
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const missingCols = CSV_REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col),
  );
  if (missingCols.length > 0) {
    addError(
      filePath,
      1,
      `CSV 缺少必填列: ${missingCols.join(", ")}`,
    );
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] ?? "";
    }
    records.push({ ...record, _line: i + 1 });
  }

  return { headers, records };
}

function validateCSVRecords(records, filePath) {
  if (!records || records.length === 0) return;

  const seen = new Set();
  const roleKeys = new Set();

  for (const record of records) {
    const line = record._line;

    // 1. 必填字段
    for (const col of CSV_REQUIRED_COLUMNS) {
      if (!record[col] || record[col].trim() === "") {
        addError(filePath, line, `必填字段 "$${col}" 为空`);
      }
    }

    // 2. 枚举值
    if (record.stage && !ALLOWED_STAGES.includes(record.stage)) {
      addWarning(
        filePath,
        line,
        `stage 值 "${record.stage}" 不在推荐枚举中: ${ALLOWED_STAGES.join(", ")}`,
      );
    }
    if (record.resourceType && !ALLOWED_RESOURCE_TYPES.includes(record.resourceType)) {
      addWarning(
        filePath,
        line,
        `resourceType 值 "${record.resourceType}" 不在推荐枚举中`,
      );
    }
    if (record.difficulty && !ALLOWED_DIFFICULTIES.includes(record.difficulty)) {
      addWarning(
        filePath,
        line,
        `difficulty 值 "${record.difficulty}" 不在推荐枚举中`,
      );
    }

    // 3. 重复记录（基于 roleKey+abilityKey+stage+resourceType 组合键）
    const dedupKey = `${record.roleKey}|${record.abilityKey}|${record.stage}|${record.resourceType}|${record.source}`;
    if (seen.has(dedupKey)) {
      addWarning(filePath, line, `疑似重复记录: ${dedupKey}`);
    }
    seen.add(dedupKey);

    // 4. URL 格式
    if (record.source && record.source.startsWith("http") && !URL_PATTERN.test(record.source)) {
      addError(filePath, line, `source URL 格式无效: ${record.source}`);
    }

    // 5. 日期格式
    if (record.updatedAt && !DATE_PATTERN.test(record.updatedAt)) {
      addError(filePath, line, `updatedAt 格式无效 (应为 YYYY-MM-DD): ${record.updatedAt}`);
    }
    if (record.validUntil && !DATE_PATTERN.test(record.validUntil)) {
      addError(filePath, line, `validUntil 格式无效 (应为 YYYY-MM-DD): ${record.validUntil}`);
    }

    // 6. 时效性
    if (record.validUntil && DATE_PATTERN.test(record.validUntil)) {
      const expiry = new Date(record.validUntil);
      if (expiry < new Date()) {
        addWarning(filePath, line, `记录已过期: validUntil=${record.validUntil}`);
      }
    }

    // 7. 职业扩展能力
    if (record.roleKey) roleKeys.add(record.roleKey);

    // 8. 敏感信息
    for (const { name, pattern } of PII_PATTERNS) {
      const values = Object.values(record).join(" ");
      if (pattern.test(values)) {
        addError(filePath, line, `检测到疑似${name}: ${values.match(pattern)?.[0]}`);
      }
    }
  }

  // 7b. 职业覆盖报告
  if (roleKeys.size < 3) {
    addWarning(filePath, 0, `仅覆盖 ${roleKeys.size} 个职业 (roleKey)，建议 ≥3`);
  }
}

function validateMarkdownFile(content, filePath) {
  const lines = content.split(/\r?\n/);
  let hasTitle = false;
  let hasContent = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 跳过代码块
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // 检查标题
    if (line.startsWith("#")) {
      hasTitle = true;
    }

    // 检查非空内容行
    if (line.trim().length > 0 && !line.startsWith("#") && !line.startsWith(">")) {
      hasContent = true;
    }

    // 敏感信息
    for (const { name, pattern } of PII_PATTERNS) {
      if (pattern.test(line)) {
        addError(filePath, lineNum, `检测到疑似${name}`);
      }
    }
  }

  if (!hasTitle) {
    addWarning(filePath, 1, "缺少标题");
  }
  if (!hasContent) {
    addError(filePath, 0, "文档内容为空");
  }

  // 趋势研究库特殊检查：必须有来源和日期
  if (basename(filePath).includes("趋势") || basename(filePath).includes("trend")) {
    const combined = content;
    const urlCount = (combined.match(/https?:\/\/[^\s)]+/g) || []).length;
    const dateCount = (combined.match(/\d{4}-\d{2}-\d{2}/g) || []).length;
    if (urlCount < 3) {
      addWarning(filePath, 0, `趋势研究库仅有 ${urlCount} 个 URL，建议每条数据附带来源链接`);
    }
    if (dateCount < 3) {
      addWarning(filePath, 0, `趋势研究库仅有 ${dateCount} 个日期，建议每条数据标注日期`);
    }
  }
}

// ---- 主扫描 ----

function scanDirectory(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`目录不存在: ${dir}`);
    process.exit(1);
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }

    const ext = extname(entry.name).toLowerCase();
    let content;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      addError(fullPath, 0, "无法读取文件");
      continue;
    }

    if (content.trim().length === 0) {
      addError(fullPath, 0, "文件为空");
      continue;
    }

    if (ext === ".csv") {
      const parsed = parseCSV(content, fullPath);
      if (parsed) {
        validateCSVRecords(parsed.records, fullPath);
        console.log(`  📊 CSV: ${basename(entry.name)} — ${parsed.records.length} 条记录`);
      }
    } else if ([".md", ".txt", ".markdown"].includes(ext)) {
      validateMarkdownFile(content, fullPath);
      console.log(`  📝 文档: ${basename(entry.name)}`);
    }
  }
}

// ---- 入口 ----

const targetDir = process.argv[2] || defaultDir;
console.log(`🔍 验证知识库数据: ${targetDir}\n`);
scanDirectory(targetDir);

// ---- 报告 ----

const totalErrors = REPORT.errors.length;
const totalWarnings = REPORT.warnings.length;

if (totalErrors > 0) {
  console.log(`\n❌ 错误 (${totalErrors}):`);
  for (const { file, line, message } of REPORT.errors) {
    console.log(`  ${file}${line > 0 ? `:${line}` : ""}: ${message}`);
  }
}

if (totalWarnings > 0) {
  console.log(`\n⚠️  警告 (${totalWarnings}):`);
  for (const { file, line, message } of REPORT.warnings) {
    console.log(`  ${file}${line > 0 ? `:${line}` : ""}: ${message}`);
  }
}

console.log(
  `\n${"=".repeat(50)}\n📋 汇总: ${totalErrors} 错误, ${totalWarnings} 警告`,
);

if (totalErrors > 0) {
  console.log("❌ 验证失败，请修复上述错误");
  process.exit(1);
} else if (totalWarnings > 0) {
  console.log("✅ 验证通过（有警告但无错误）");
  process.exit(0);
} else {
  console.log("🎉 全部验证通过！");
  process.exit(0);
}
