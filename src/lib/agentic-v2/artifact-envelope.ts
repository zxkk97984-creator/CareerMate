import { agentArtifactV1Schema, type AgentArtifactV1 } from "./contracts";

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

/**
 * 从 TBox 文本响应中精确提取一个 CAREERMATE_ARTIFACT 信封。
 *
 * 规则：
 * - 仅识别精确标签 `<CAREERMATE_ARTIFACT>` / `</CAREERMATE_ARTIFACT>`
 * - 绝不从无标签 JSON、Markdown 代码块或通用模式中提取
 * - 多个信封 → 拒绝并返回 MULTIPLE_ARTIFACT_ENVELOPES 警告
 * - 无效 JSON 或不符合 schema → 保留可视文本，不创建候选
 */
export function parseAgentArtifactEnvelope(text: string): ParsedAgentArtifactEnvelope {
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
      displayText: text,
      warnings: ["MULTIPLE_ARTIFACT_ENVELOPES"],
    };
  }

  // 缺少闭合标签
  if (close < 0) {
    return {
      displayText: text,
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

  // JSON 解析 + Zod 校验
  try {
    const parsed = JSON.parse(raw);
    const result = agentArtifactV1Schema.safeParse(parsed);
    if (!result.success) {
      return {
        displayText,
        warnings: ["INVALID_ARTIFACT_SCHEMA"],
      };
    }
    return {
      displayText,
      artifact: result.data,
      warnings: [],
    };
  } catch {
    return {
      displayText,
      warnings: ["INVALID_ARTIFACT_ENVELOPE"],
    };
  }
}
