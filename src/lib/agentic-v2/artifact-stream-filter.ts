import { ARTIFACT_CLOSE_TAG, ARTIFACT_OPEN_TAG } from "./artifact-envelope";

export interface ArtifactStreamFilterResult {
  text: string;
  warnings: string[];
}

function partialTagSuffix(value: string, tag: string): number {
  const max = Math.min(value.length, tag.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (value.endsWith(tag.slice(0, length))) return length;
  }
  return 0;
}

/**
 * 增量过滤 CAREERMATE_ARTIFACT 信封。
 *
 * 过滤器的安全边界是“从完整开标签开始，到完整闭标签结束”：
 * - 标签可能被拆到任意多个 chunk；
 * - 信封内部的 JSON 永不进入 delta；
 * - 多个信封或缺少闭标签时也只丢弃协议内容，不丢弃信封外正文；
 * - finish 会返回最后一段安全文本和协议警告。
 */
export function createArtifactStreamFilter() {
  let pending = "";
  let inside = false;
  let sawOpen = false;
  let sawClose = false;
  let openCount = 0;
  const warnings: string[] = [];

  return {
    push(chunk: string): string {
      if (!chunk) return "";
      pending += chunk;
      let output = "";

      while (pending.length > 0) {
        if (inside) {
          const close = pending.indexOf(ARTIFACT_CLOSE_TAG);
          if (close < 0) {
            const keep = partialTagSuffix(pending, ARTIFACT_CLOSE_TAG);
            pending = keep > 0 ? pending.slice(pending.length - keep) : "";
            break;
          }
          pending = pending.slice(close + ARTIFACT_CLOSE_TAG.length);
          inside = false;
          sawClose = true;
          continue;
        }

        const open = pending.indexOf(ARTIFACT_OPEN_TAG);
        if (open < 0) {
          const keep = partialTagSuffix(pending, ARTIFACT_OPEN_TAG);
          output += keep > 0 ? pending.slice(0, pending.length - keep) : pending;
          pending = keep > 0 ? pending.slice(pending.length - keep) : "";
          break;
        }

        output += pending.slice(0, open);
        pending = pending.slice(open + ARTIFACT_OPEN_TAG.length);
        openCount += 1;
        sawOpen = true;
        inside = true;
      }

      return output;
    },
    finish(): ArtifactStreamFilterResult {
      if (inside) {
        warnings.push("INVALID_ARTIFACT_ENVELOPE");
        pending = "";
        inside = false;
      } else if (pending) {
        // 未闭合的普通文本或标签前缀按正文返回；它不含信封 JSON。
        const tail = pending;
        pending = "";
        return { text: tail, warnings };
      }
      if (openCount > 1) {
        warnings.push("MULTIPLE_ARTIFACT_ENVELOPES");
      } else if (sawOpen && !sawClose) {
        warnings.push("INVALID_ARTIFACT_ENVELOPE");
      }
      return { text: "", warnings: [...new Set(warnings)] };
    },
  };
}
