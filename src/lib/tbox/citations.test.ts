import { describe, expect, it } from "vitest";
import {
  isValidExternalUrl,
  determineCitationLabel,
  normalizeCitations,
  detectSearchToolCall,
  isSearchToolCall,
  resolveSearchPolicy,
} from "./citations";

describe("isValidExternalUrl", () => {
  it("接受合法的 HTTP(S) URL", () => {
    expect(isValidExternalUrl("https://www.example.com/article")).toBe(true);
    expect(isValidExternalUrl("http://blog.example.com/post/1")).toBe(true);
  });

  it("拒绝裸 https://", () => {
    expect(isValidExternalUrl("https://")).toBe(false);
  });

  it("拒绝 localhost", () => {
    expect(isValidExternalUrl("http://localhost:3000")).toBe(false);
    expect(isValidExternalUrl("https://127.0.0.1")).toBe(false);
  });

  it("拒绝空字符串", () => {
    expect(isValidExternalUrl("")).toBe(false);
  });

  it("拒绝非 HTTP 协议", () => {
    expect(isValidExternalUrl("ftp://files.example.com")).toBe(false);
    expect(isValidExternalUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("determineCitationLabel", () => {
  it("搜索工具 + citation + 合法URL → 实时联网调研", () => {
    expect(determineCitationLabel({
      hasSearchToolCall: true,
      hasCitationEvent: true,
      hasValidUrl: true,
      hasKnowledgeBaseSource: false,
    })).toBe("实时联网调研");
  });

  it("citation + 搜索工具无有效URL → 已核验职业库", () => {
    expect(determineCitationLabel({
      hasSearchToolCall: true,
      hasCitationEvent: true,
      hasValidUrl: false,
      hasKnowledgeBaseSource: false,
    })).toBe("已核验职业库");
  });

  it("无 citation 证据 → AI分析与推断", () => {
    expect(determineCitationLabel({
      hasSearchToolCall: false,
      hasCitationEvent: false,
      hasValidUrl: false,
      hasKnowledgeBaseSource: false,
    })).toBe("AI分析与推断");
  });

  it("有 URL 但无搜索工具调用 → 不标实时调研", () => {
    // 无搜索工具、无知识库来源 → 无法验证来源，标 AI 推断
    expect(determineCitationLabel({
      hasSearchToolCall: false,
      hasCitationEvent: true,
      hasValidUrl: true,
      hasKnowledgeBaseSource: false,
    })).toBe("AI分析与推断");
  });
});

describe("normalizeCitations", () => {
  it("空数组返回空", () => {
    expect(normalizeCitations([], false)).toEqual([]);
  });

  it("归一化有效 citation", () => {
    const result = normalizeCitations([
      { title: "DBA职业发展", source: "知乎", url: "https://zhihu.com/article/1" },
    ], true);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("实时联网调研");
    expect(result[0].url).toBe("https://zhihu.com/article/1");
  });

  it("伪造 URL 被滤除但保留 citation", () => {
    const result = normalizeCitations([
      { title: "来源", source: "未知", url: "https://" },
    ], false);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBeUndefined();
    expect(result[0].label).toBe("AI分析与推断");
  });
});

describe("detectSearchToolCall", () => {
  it("检测已知搜索工具名", () => {
    expect(detectSearchToolCall(new Set(["search_engine"]))).toBe(true);
    expect(detectSearchToolCall(new Set(["web_search"]))).toBe(true);
    expect(detectSearchToolCall(new Set(["联网搜索"]))).toBe(true);
  });

  it("不匹配非搜索工具", () => {
    expect(detectSearchToolCall(new Set(["text_generation"]))).toBe(false);
  });
  it("recognizes real Quark search tool names", () => {
    expect(detectSearchToolCall(new Set(["quark_article_search_content"]))).toBe(true);
    expect(detectSearchToolCall(new Set(["quark_web_search"]))).toBe(true);
  });

  it("isSearchToolCall recognizes Quark tool records", () => {
    expect(isSearchToolCall([{ toolType: "tool", tool: "quark_article_search_content", toolId: "t1" } as any])).toBe(true);
    expect(isSearchToolCall([{ toolType: "knowledge", tool: "kb_001", toolId: "t2" } as any])).toBe(false);
  });

});

describe("resolveSearchPolicy", () => {
  it("全局关闭→false", () => {
    expect(resolveSearchPolicy(false, "required")).toBe(false);
  });

  it("全局开启+required→true", () => {
    expect(resolveSearchPolicy(true, "required")).toBe(true);
  });

  it("全局开启+off→false", () => {
    expect(resolveSearchPolicy(true, "off")).toBe(false);
  });
  it("allowed also enables search", () => {
    expect(resolveSearchPolicy(true, "allowed")).toBe(true);
  });

  it("unspecified policy defaults to enabled", () => {
    expect(resolveSearchPolicy(true, undefined)).toBe(true);
  });

});
