import { validatedAgentArtifactV1Schema, type AgentArtifactV1 } from "./contracts";
import {
  normalizeSimulationScenarioArtifactData,
  type SimulationScenarioNormalizationDefaults,
} from "./simulation-scenario-normalization";

/** 精确协议标签——仅匹配这些精确字符串 */
export const ARTIFACT_OPEN_TAG = "<CAREERMATE_ARTIFACT>";
export const ARTIFACT_CLOSE_TAG = "</CAREERMATE_ARTIFACT>";

/** 单次扫描最多处理 65,536 字节的信封内容 */
const MAX_ENVELOPE_BYTES = 65_536;

export interface ParsedAgentArtifactEnvelope {
  /** 剥离信封后的可视文本 */
  displayText: string;
  /** 解析并校验通过的 artifact，未找到或无效时为 undefined */
  artifact?: AgentArtifactV1;
  /** 解析过程中产生的警告码 */
  warnings: string[];
}

export interface ParseAgentArtifactEnvelopeOptions {
  simulationScenarioDefaults?: SimulationScenarioNormalizationDefaults;
}

const REPAIRABLE_JSON_WARNING = "REPAIRED_ARTIFACT_JSON";
const NORMALIZED_SCHEMA_WARNING = "NORMALIZED_ARTIFACT_SCHEMA_VERSION";

function nextNonWhitespace(text: string, index: number): string {
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    if (!/\s/.test(text[cursor]!)) return text[cursor]!;
  }
  return "";
}

/**
 * 仅修复字符串值内部未转义的 ASCII 双引号。
 *
 * 平台模型偶尔会把“必须本次交付”这类中文引号写成 ASCII 双引号，导致
 * JSON.parse 失败。这里只改变 JSON 语法，不改变文本内容；修复后仍必须通过
 * 完整 schema 校验，无法修复或语义不合法时继续按无效信封处理。
 */
function repairUnescapedStringQuotes(raw: string): string {
  let output = "";
  let inString = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }
    if (char === "\\") {
      output += char;
      if (index + 1 < raw.length) {
        index += 1;
        output += raw[index]!;
      }
      continue;
    }
    if (char !== '"') {
      output += char;
      continue;
    }
    const next = nextNonWhitespace(raw, index);
    if (next === "" || next === ":" || next === "," || next === "}" || next === "]") {
      output += char;
      inString = false;
    } else {
      output += '\\"';
    }
  }
  return output;
}

export function parseArtifactJson(raw: string): { value: unknown; warnings: string[] } | null {
  try {
    return { value: JSON.parse(raw), warnings: [] };
  } catch {
    const repaired = repairUnescapedStringQuotes(raw);
    if (repaired === raw) return null;
    try {
      return { value: JSON.parse(repaired), warnings: [REPAIRABLE_JSON_WARNING] };
    } catch {
      return null;
    }
  }
}

export function normalizeArtifactMetadata(value: unknown): { value: unknown; warnings: string[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value, warnings: [] };
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, "schemaVersion")) {
    return { value, warnings: [] };
  }
  return {
    value: { ...record, schemaVersion: "1.0" },
    warnings: [NORMALIZED_SCHEMA_WARNING],
  };
}

/**
 * 删除所有可识别信封区域，包括未闭合信封的尾部。
 * 该函数只用于展示文本，不负责判断 artifact 是否有效。
 */
function stripEnvelopeRegions(text: string): string {
  let cursor = 0;
  let output = "";
  while (cursor < text.length) {
    const open = text.indexOf(ARTIFACT_OPEN_TAG, cursor);
    if (open < 0) {
      output += text.slice(cursor);
      break;
    }
    output += text.slice(cursor, open);
    const close = text.indexOf(ARTIFACT_CLOSE_TAG, open + ARTIFACT_OPEN_TAG.length);
    if (close < 0) break;
    cursor = close + ARTIFACT_CLOSE_TAG.length;
  }
  return output.trim();
}

/**
 * 从 TBox 文本响应中精确提取一个 CAREERMATE_ARTIFACT 信封。
 *
 * 规则：
 * - 仅识别精确标签 `<CAREERMATE_ARTIFACT>` / `</CAREERMATE_ARTIFACT>`
 * - 绝不从无标签 JSON、Markdown 代码块或通用模式中提取
 * - 多个信封 → 拒绝并返回 MULTIPLE_ARTIFACT_ENVELOPES 警告
 * - 无效 JSON 或不符合 schema → 保留可视文本，不创建候选
 */
export function parseAgentArtifactEnvelope(
  text: string,
  options: ParseAgentArtifactEnvelopeOptions = {},
): ParsedAgentArtifactEnvelope {
  const open = text.indexOf(ARTIFACT_OPEN_TAG);
  if (open < 0) return { displayText: text, warnings: [] };

  const secondOpen = text.indexOf(ARTIFACT_OPEN_TAG, open + ARTIFACT_OPEN_TAG.length);
  const close = text.indexOf(ARTIFACT_CLOSE_TAG, open + ARTIFACT_OPEN_TAG.length);
  const secondClose = close < 0
    ? -1
    : text.indexOf(ARTIFACT_CLOSE_TAG, close + ARTIFACT_CLOSE_TAG.length);

  // 多个打开标签或闭合标签 → 拒绝
  if (secondOpen >= 0 || secondClose >= 0) {
    return {
      displayText: stripEnvelopeRegions(text),
      warnings: ["MULTIPLE_ARTIFACT_ENVELOPES"],
    };
  }

  // 缺少闭合标签
  if (close < 0) {
    return {
      displayText: text.slice(0, open).trim(),
      warnings: ["INVALID_ARTIFACT_ENVELOPE"],
    };
  }

  // 提取原始 JSON
  const raw = text.slice(open + ARTIFACT_OPEN_TAG.length, close).trim();

  // 构建剥离后的可视文本
  const displayText = (
    text.slice(0, open) +
    text.slice(close + ARTIFACT_CLOSE_TAG.length)
  ).trim();

  // 大小检查
  if (Buffer.byteLength(raw, "utf8") > MAX_ENVELOPE_BYTES) {
    return {
      displayText,
      warnings: ["ARTIFACT_ENVELOPE_TOO_LARGE"],
    };
  }

  // JSON 解析 + 保守语法修复 + Zod 校验
  const parsed = parseArtifactJson(raw);
  if (!parsed) {
    return {
      displayText,
      warnings: ["INVALID_ARTIFACT_ENVELOPE"],
    };
  }
  const normalized = normalizeArtifactMetadata(parsed.value);
  const scenarioNormalized = normalizeSimulationScenarioArtifactData(
    normalized.value,
    options.simulationScenarioDefaults,
  );
  const result = validatedAgentArtifactV1Schema.safeParse(scenarioNormalized);
  if (!result.success) {
    return {
      displayText,
      warnings: [...parsed.warnings, ...normalized.warnings, "INVALID_ARTIFACT_SCHEMA"],
    };
  }
  return {
    displayText,
    artifact: result.data,
    warnings: [...parsed.warnings, ...normalized.warnings],
  };
}
