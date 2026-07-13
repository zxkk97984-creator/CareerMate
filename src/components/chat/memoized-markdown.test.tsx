import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoizedMarkdown } from "./memoized-markdown";

describe("MemoizedMarkdown", () => {
  /* ── 基础 Markdown 渲染 ── */

  it("**AI 产品经理** 渲染为 <strong>，不显示 ** 符号", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="**AI 产品经理**" />);
    expect(html).toContain("<strong>AI 产品经理</strong>");
    // 渲染后不应出现 ** 包裹的原始文字
    expect(html).not.toContain("**AI 产品经理**");
  });

  it("加粗和斜体正确渲染", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="**加粗** 和 *斜体*" />);
    expect(html).toContain("<strong>加粗</strong>");
    expect(html).toContain("<em>斜体</em>");
  });

  it("标题正确渲染（标题生成 h1/h2/h3 元素）", () => {
    // 每个标题单独测试，避免 renderToStaticMarkup 的换行处理差异
    const h1html = renderToStaticMarkup(<MemoizedMarkdown content="# 一级标题" />);
    expect(h1html).toContain("<h1>一级标题</h1>");

    const h2html = renderToStaticMarkup(<MemoizedMarkdown content="## 二级标题" />);
    expect(h2html).toContain("<h2>二级标题</h2>");

    const h3html = renderToStaticMarkup(<MemoizedMarkdown content="### 三级标题" />);
    expect(h3html).toContain("<h3>三级标题</h3>");
  });

  it("有序和无序列表正确渲染", () => {
    // 使用数组 join 确保实际换行符传递给组件
    const ulContent = ["- 项目一", "- 项目二"].join("\n");
    const ulHtml = renderToStaticMarkup(<MemoizedMarkdown content={ulContent} />);
    // 验证 ul 标签存在
    expect(ulHtml).toContain("<ul>");

    const olContent = ["1. 第一步", "2. 第二步"].join("\n");
    const olHtml = renderToStaticMarkup(<MemoizedMarkdown content={olContent} />);
    // 验证 ol 标签存在
    expect(olHtml).toContain("<ol>");
  });

  it("链接在新标签页打开", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="[百度](https://baidu.com)" />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://baidu.com"');
  });

  it("行内代码正确渲染", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="使用 `fetchApi` 函数" />);
    // react-markdown 生成 <code> 元素（可能带 class）
    expect(html).toMatch(/<code[^>]*>fetchApi<\/code>/);
  });

  it("代码块正确渲染", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content={"```ts\nconst x = 1;\n```"} />);
    expect(html).toContain("<pre>");
    expect(html).toContain("const x = 1;");
    expect(html).toContain("language-ts");
  });

  it("引用正确渲染", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="> 这是一条引用" />);
    expect(html).toContain("<blockquote>");
  });

  it("表格正确渲染（GFM）", () => {
    const content = "| 能力 | 得分 |\n| --- | --- |\n| 沟通 | 85 |\n| 数据 | 72 |";
    const html = renderToStaticMarkup(<MemoizedMarkdown content={content} />);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>能力</th>");
    expect(html).toContain("<td>沟通</td>");
  });

  /* ── XSS 安全：react-markdown 默认转义所有原始 HTML ── */

  it("<script> 标签被转义为文本，不会被浏览器执行", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content={'<script>alert("xss")</script>'} />);
    // react-markdown 默认不渲染原始 HTML，转义为 &lt;script&gt;...&lt;/script&gt;
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("HTML 标签被转义为文本", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content={'<img src=x onerror=alert(1)>'} />);
    // img 标签被转义，不会解释为 HTML
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("javascript: 协议链接不被渲染为可点击链接", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="[点击](javascript:alert(1))" />);
    // react-markdown 默认不渲染 javascript: 协议链接
    expect(html).not.toMatch(/href=["']javascript:/i);
  });

  /* ── SSE 流式兼容 ── */

  it("流式期间不完整 Markdown 不崩溃（不完整加粗）", () => {
    expect(() => {
      renderToStaticMarkup(<MemoizedMarkdown content="**AI 产品" />);
    }).not.toThrow();
  });

  it("流式期间不完整 Markdown 不崩溃（空内容返回 null）", () => {
    const result = renderToStaticMarkup(<MemoizedMarkdown content="" />);
    expect(result).toBe("");
  });

  it("流式完成后的完整内容正确渲染", () => {
    const completed = [
      "**AI 产品经理**",
      "",
      "**直接结论：**",
      "",
      "1. **发现和定义问题**：与业务方沟通需求。",
      "2. **用户研究**：进行竞品分析。",
    ].join("\n");
    const html = renderToStaticMarkup(<MemoizedMarkdown content={completed} />);
    expect(html).toContain("<strong>AI 产品经理</strong>");
    expect(html).toContain("<strong>直接结论：</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>");
  });

  /* ── 不规范格式最小兼容 ── */

  it('修正 "**直接结论： **" 中的多余空格并正确渲染', () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="**直接结论： ** 这是结果。" />);
    // 加粗应正确渲染
    expect(html).toContain("<strong>直接结论：</strong>");
    // 不应出现 ** 标记符号
    expect(html).not.toContain("**");
  });

  /* ── 段落与换行 ── */

  it("段落之间有空行时生成独立 <p>", () => {
    const html = renderToStaticMarkup(<MemoizedMarkdown content="第一段。\n\n第二段。" />);
    // 应有两个段落
    expect(html).toMatch(/<p>[^<]*第一段[^<]*<\/p>/);
    expect(html).toMatch(/<p>[^<]*第二段[^<]*<\/p>/);
  });

  /* ── 长内容不崩溃 ── */

  it("长代码块不导致崩溃", () => {
    const longCode = "```\n" + "const x = 1;\n".repeat(100) + "```";
    expect(() => {
      renderToStaticMarkup(<MemoizedMarkdown content={longCode} />);
    }).not.toThrow();
  });
});
