"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

interface AppShellProps {
  /** 侧栏内容 */
  sidebar: ReactNode;
  /** 主内容区 */
  children: ReactNode;
  /** 页面标题（移动端顶部栏显示） */
  pageTitle?: string;
}

/**
 * 统一应用外壳
 *
 * 桌面端：固定 280px 侧栏 + 主区最大 1180px
 * 移动端：侧栏变为抽屉，顶部显示品牌/标题/菜单按钮
 */
export function AppShell({ sidebar, children, pageTitle }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="chat-home-layout"
      data-testid="app-shell"
    >
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 侧栏（由 ProductSidebar 提供，内部处理 open/onClose） */}
      {sidebar}

      {/* 主内容区 */}
      <main
        className="chat-main"
        data-testid="page-content"
        style={{ maxWidth: "var(--cm-content-max)", margin: "0 auto" }}
      >
        {/* 移动端菜单按钮 */}
        <button
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-expanded={sidebarOpen}
          aria-controls="primary-sidebar"
          aria-label="打开菜单"
        >
          <Menu size={20} />
        </button>

        {pageTitle && (
          <span
            className="mobile-page-title"
            style={{
              display: "none",
              position: "absolute",
              top: 14,
              left: 52,
              fontSize: 15,
              fontWeight: 600,
              color: "var(--cm-text-strong)",
            }}
          >
            {pageTitle}
          </span>
        )}

        {children}
      </main>
    </div>
  );
}
