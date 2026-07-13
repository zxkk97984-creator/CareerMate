"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdownContent } from "@/lib/markdown-utils";

interface MemoizedMarkdownProps {
  /** Markdown 文本内容 */
  content: string;
}

/**
 * 规则集：禁止 AI 输出中的原始 HTML，防止 XSS。
 * react-markdown 默认不渲染原始 HTML（将标签转义为文本），
 * 通过 remark-gfm 支持表格、删除线等扩展语法。
 */

/**
 * AI 助手消息的 Markdown 渲染组件（memo 优化，避免流式期间不必要的重渲染）。
 *
 * - 使用 react-markdown + remark-gfm 渲染
 * - 链接在新标签页打开，添加 rel="noopener noreferrer"
 * - 禁止原始 HTML，防止 XSS
 * - 流式期间 Markdown 不完整时正常显示部分渲染结果，不报错
 */
export const MemoizedMarkdown = memo(function MemoizedMarkdown({
  content,
}: MemoizedMarkdownProps) {
  if (!content) return null;

  // 流式期间内容可能不完整，react-markdown 会尽力渲染不会崩溃
  const normalized = normalizeMarkdownContent(content);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}, arePropsEqual);

function arePropsEqual(
  prev: MemoizedMarkdownProps,
  next: MemoizedMarkdownProps,
): boolean {
  return prev.content === next.content;
}
