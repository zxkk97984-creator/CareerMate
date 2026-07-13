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

  it("不修改代码块中的 '**关键词： **' 模式", () => {
    // 代码块中的 "**label: **" 不应被规范化
    const input = "```json\n{\n  \"note\": \"**标签： ** 请勿修改\"\n}\n```";
    expect(normalizeMarkdownContent(input)).toBe(input);
  });

  it("代码块前后的普通文本仍被规范化", () => {
    // 代码块外需要修正，代码块内保持原样
    const beforeBlock = "**注意： ** 以下是示例代码。\n\n";
    const codeBlock = "```json\n{ \"note\": \"**标签： ** 内部不动\" }\n```\n\n";
    const afterBlock = "**结论： ** 以上即为结果。";
    const input = beforeBlock + codeBlock + afterBlock;
    const result = normalizeMarkdownContent(input);

    // 代码块外的加粗被修正
    expect(result).toContain("**注意：** ");
    expect(result).toContain("**结论：** ");
    // 代码块内的内容原样保留
    expect(result).toContain("**标签： ** 内部不动");
  });

  it("多个代码块各自被保护", () => {
    const input = [
      "**第一点： ** 说明。",
      "",
      "```js",
      "console.log('**不要动： **');",
      "```",
      "",
      "**第二点： ** 继续。",
      "",
      "```python",
      "x = '**也别动： **'",
      "```",
    ].join("\n");
    const result = normalizeMarkdownContent(input);

    // 普通文本被修正
    expect(result).toContain("**第一点：** ");
    expect(result).toContain("**第二点：** ");
    // 代码块内容不变
    expect(result).toContain("console.log('**不要动： **');");
    expect(result).toContain("x = '**也别动： **'");
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
