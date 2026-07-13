import { describe, expect, it } from "vitest";
import { normalizeMarkdownContent } from "@/lib/markdown-utils";

describe("normalizeMarkdownContent", () => {
  it("不修改正常 Markdown 加粗", () => {
    expect(normalizeMarkdownContent("**AI 产品经理**"))
      .toBe("**AI 产品经理**");
  });

  it('修正 "**直接结论： **" 中的多余空格', () => {
    expect(normalizeMarkdownContent("**直接结论： **"))
      .toBe("**直接结论：** ");
  });

  it('修正 "**直接结论: **" 中的多余空格（半角冒号）', () => {
    expect(normalizeMarkdownContent("**直接结论: **"))
      .toBe("**直接结论：** ");
  });

  it("修正多段加粗中的空格问题", () => {
    const input = "**发现和定义问题： ** 这是第一步。\n**用户研究： ** 这是第二步。";
    const expected = "**发现和定义问题：**  这是第一步。\n**用户研究：**  这是第二步。";
    expect(normalizeMarkdownContent(input)).toBe(expected);
  });

  it("不修改代码块中的星号", () => {
    const input = "```js\nconst x = **2;\n```";
    expect(normalizeMarkdownContent(input)).toBe(input);
  });

  it("不修改普通星号（非加粗标记）", () => {
    expect(normalizeMarkdownContent("这是一个 * 星号分隔"))
      .toBe("这是一个 * 星号分隔");
  });

  it("不修改没有冒号的加粗", () => {
    expect(normalizeMarkdownContent("**重要说明**"))
      .toBe("**重要说明**");
  });

  it("空字符串原样返回", () => {
    expect(normalizeMarkdownContent("")).toBe("");
  });

  it("不需要规范化的文本原样返回", () => {
    const text = "我是一名AI产品经理，这里有**一些强调**的内容。";
    expect(normalizeMarkdownContent(text)).toBe(text);
  });
});
