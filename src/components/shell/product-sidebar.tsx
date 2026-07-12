"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, MessageSquarePlus } from "lucide-react";
import { mainNavItems, adminNavItem, chatNavItem, type NavItem } from "./nav-items";
import { cn } from "@/components/ui/cn";

interface ProductSidebarProps {
  /** 聊天模式：显示新对话和会话历史；工作台模式：显示返回对话入口 */
  variant: "chat" | "workspace";
  /** 待确认画像候选数 */
  pendingCandidateCount?: number;
  /** 用户显示名 */
  displayName: string;
  /** 是否为管理员 */
  isAdmin?: boolean;
  /** 移动端侧栏是否打开 */
  open: boolean;
  /** 关闭移动端侧栏 */
  onClose: () => void;
  /** 聊天模式：新对话按钮 */
  onNewChat?: () => void;
  /** 聊天模式：会话列表渲染（由调用方提供） */
  conversationList?: React.ReactNode;
}

/**
 * 统一产品侧栏
 *
 * 聊天 variant：显示新对话 + 会话历史 + 底部导航
 * 工作台 variant：显示返回 AI 对话 + 模块导航
 *
 * 统一品牌、active 状态、候选角标、用户姓名和退出
 * 退出使用 POST /api/auth/logout
 */
export function ProductSidebar({
  variant,
  pendingCandidateCount = 0,
  displayName,
  isAdmin = false,
  open,
  onClose,
  onNewChat,
  conversationList,
}: ProductSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  /** 判断导航项是否活跃 */
  const isActive = (item: NavItem) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  };

  /** POST 退出登录 */
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <aside
      className={cn("chat-sidebar", open && "sidebar-open")}
      data-testid="primary-sidebar"
    >
      {/* ── 品牌区 ──────────────────────────────────────── */}
      <div className="sidebar-brand">
        <div className="brand-icon">CM</div>
        <span className="brand-name">CareerMate</span>
      </div>

      {/* ── 顶部操作区 ──────────────────────────────────── */}
      {variant === "chat" && onNewChat && (
        <button className="new-chat-btn" onClick={onNewChat}>
          <MessageSquarePlus size={18} />
          <span>新对话</span>
        </button>
      )}

      {variant === "workspace" && (
        <div className="sidebar-footer" style={{ borderTop: "none", paddingTop: 0 }}>
          <Link
            href={chatNavItem.href}
            className="footer-link"
            style={{ color: "var(--cm-brand)", fontWeight: 500 }}
          >
            <chatNavItem.icon size={16} />
            <span>{chatNavItem.label}</span>
          </Link>
        </div>
      )}

      {/* ── 会话列表（聊天模式） ────────────────────────── */}
      {variant === "chat" && conversationList}

      {/* ── 底部导航 ────────────────────────────────────── */}
      <div className="sidebar-footer">
        {mainNavItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="footer-link"
              onClick={onClose}
              style={active ? {
                background: "var(--cm-surface-soft)",
                color: "var(--cm-brand)",
              } : undefined}
              aria-current={active ? "page" : undefined}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
              {item.href === "/memory" && pendingCandidateCount > 0 && (
                <span className="footer-badge">{pendingCandidateCount}</span>
              )}
            </Link>
          );
        })}

        {/* Admin 入口 */}
        {isAdmin && (
          <Link
            href={adminNavItem.href}
            className="footer-link"
            onClick={onClose}
            style={isActive(adminNavItem) ? {
              background: "var(--cm-surface-soft)",
              color: "var(--cm-brand)",
            } : undefined}
            aria-current={isActive(adminNavItem) ? "page" : undefined}
          >
            <adminNavItem.icon size={16} />
            <span>{adminNavItem.label}</span>
          </Link>
        )}

        {/* 用户区 */}
        <div className="sidebar-user">
          <span className="user-name">{displayName}</span>
          <button
            type="button"
            className="logout-link"
            onClick={handleLogout}
            title="退出登录"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
