"use client";

import { useCallback, useRef, useState } from "react";
import type { ConversationItem } from "@/lib/chat/schemas";
import {
  MessageSquarePlus,
  Trash2,
  Pencil,
  Check,
  X,
  MessageSquareText,
  LayoutDashboard,
  Route,
  BrainCircuit,
  Database,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import Link from "next/link";

interface ConversationSidebarProps {
  conversations: ConversationItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  pendingCandidateCount: number;
  displayName: string;
  open: boolean;
  onClose: () => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  pendingCandidateCount,
  displayName,
  open,
  onClose,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((conv: ConversationItem) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
    requestAnimationFrame(() => inputRef.current?.select());
  }, []);

  const confirmRename = useCallback(() => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  }, [editingId, editTitle, onRename]);

  const cancelRename = useCallback(() => setEditingId(null), []);

  return (
    <aside className={`chat-sidebar ${open ? "sidebar-open" : ""}`}>
      {/* 品牌区 */}
      <div className="sidebar-brand">
        <div className="brand-icon">CM</div>
        <span className="brand-name">CareerMate</span>
      </div>

      {/* 新对话按钮 */}
      <button className="new-chat-btn" onClick={() => onNew()}>
        <MessageSquarePlus size={18} />
        <span>新对话</span>
      </button>

      {/* 会话列表 */}
      <nav className="conversation-list" role="list">
        {conversations.map(conv => (
          <div
            key={conv.id}
            className={`conversation-item ${activeId === conv.id ? "active" : ""}`}
            role="listitem"
          >
            {editingId === conv.id ? (
              <div className="rename-input-wrapper">
                <input
                  ref={inputRef}
                  className="rename-input"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  maxLength={60}
                  autoFocus
                />
                <button className="rename-confirm" onClick={confirmRename} aria-label="确认">
                  <Check size={14} />
                </button>
                <button className="rename-cancel" onClick={cancelRename} aria-label="取消">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <button
                  className="conversation-title-btn"
                  onClick={() => onSelect(conv.id)}
                  title={conv.title}
                >
                  <MessageSquareText size={16} className="conv-icon" />
                  <span className="conv-title">{conv.title || "新对话"}</span>
                </button>
                <div className="conversation-actions">
                  <button
                    className="action-btn"
                    onClick={(e) => { e.stopPropagation(); startRename(conv); }}
                    aria-label="重命名"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="action-btn action-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    aria-label="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="empty-list-hint">暂无对话，开始新对话吧</p>
        )}
      </nav>

      {/* 底部导航入口 */}
      <div className="sidebar-footer">
        <Link href="/dashboard" className="footer-link" onClick={onClose}>
          <LayoutDashboard size={16} />
          <span>成长概览</span>
        </Link>
        <Link href="/path" className="footer-link" onClick={onClose}>
          <Route size={16} />
          <span>职业路径</span>
        </Link>
        <Link href="/simulation" className="footer-link" onClick={onClose}>
          <BrainCircuit size={16} />
          <span>模拟训练</span>
        </Link>
        <Link href="/resources" className="footer-link" onClick={onClose}>
          <Database size={16} />
          <span>资源中心</span>
        </Link>
        <Link href="/memory" className="footer-link" onClick={onClose}>
          <ShieldCheck size={16} />
          <span>
            记忆权限
            {pendingCandidateCount > 0 && (
              <span className="footer-badge">{pendingCandidateCount}</span>
            )}
          </span>
        </Link>
        <div className="sidebar-user">
          <span className="user-name">{displayName}</span>
          <a href="/api/auth/logout" className="logout-link" title="退出登录">
            <LogOut size={14} />
          </a>
        </div>
      </div>
    </aside>
  );
}
