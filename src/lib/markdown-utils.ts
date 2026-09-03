/**
 * Markdown 展示用文本规范化工具
 *
 * 对百宝箱偶尔产生的不规范格式进行最小兼容，
 * 不修改数据库中的原始消息。
 */

/** 匹配三个反引号开头的围栏代码块（含可选语言标识） */
const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```/g;

interface Segment {
  text: string;
  isCode: boolean;
}

/** 将文本按围栏代码块切分为段数组，每段标记是否为代码块 */
function splitByCodeBlocks(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // 重置 lastIndex（全局正则可能带上次调用状态）
  FENCED_CODE_BLOCK_RE.lastIndex = 0;

  while ((match = FENCED_CODE_BLOCK_RE.exec(text)) !== null) {
    // 代码块之前的普通文本
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isCode: false });
    }
    // 代码块本身
    segments.push({ text: match[0], isCode: true });
    lastIndex = FENCED_CODE_BLOCK_RE.lastIndex;
  }
  // 剩余尾部普通文本
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isCode: false });
  }
  // 空字符串直接返回空段
  if (segments.length === 0) {
    segments.push({ text, isCode: false });
  }
  return segments;
}

/**
 * 规范化 Markdown 文本中的轻微格式问题。
 *
 * 当前处理：
 * - "**直接结论： **" → "**直接结论：** "（加粗结束符号前的多余空格）
 *
 * 注意：只对代码块之外的普通文本段落做规范化，
 * 围栏代码块（```...```）中的内容保留原样，不修改。
 */
export function normalizeMarkdownContent(text: string): string {
  const segments = splitByCodeBlocks(text);

  return segments
    .map((segment) => {
      if (segment.isCode) return segment.text;          // 代码块：原样保留
      return normalizeSegment(segment.text);             // 普通文本：应用规范化
    })
    .join("");
}

/** 对单个普通文本段落执行规范化替换 */
function normalizeSegment(segment: string): string {
  // 修正模式：**中文文本[：:] ** → **中文文本[：:]**
  // 匹配加粗标签内以中文冒号结尾、结束符号前有多余空格的情况
  return segment.replace(/\*\*([^*]+?)[：:]\s+\*\*/g, "**$1：** ");
}
