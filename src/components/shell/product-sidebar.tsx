"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, LogOut, MessageSquareText, Pencil, Settings, SquarePen, Trash2, X } from "lucide-react";
import { mainNavItems, adminNavItem } from "./nav-items";
import { useAssistantControllerContext } from "@/components/chat/assistant-provider";

interface Props {
  variant: "chat" | "workspace"; pendingCandidateCount?: number; displayName: string; avatar?: string | null;
  isAdmin?: boolean; open: boolean; onClose: () => void;
  onNewChat?: () => void; conversationList?: React.ReactNode;
}
export function ProductSidebar({ displayName, avatar = null, isAdmin, open, onClose, pendingCandidateCount = 0 }: Props) {
  const pathname = usePathname(); const router = useRouter();
  const c = useAssistantControllerContext();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", close); return () => { window.removeEventListener("keydown", close); previousFocus?.focus(); };
  }, [open, onClose]);
  const enter = () => { onClose(); router.push("/chat"); };
  return <aside className={`chat-sidebar product-sidebar ${open ? "sidebar-open" : ""}`} id="primary-sidebar" data-testid="primary-sidebar" aria-label="主导航">
    <Link href="/chat" className="sidebar-brand"><span className="brand-icon">CM</span><span className="brand-name">CareerMate</span></Link>
    <button className="new-chat-btn" onClick={() => { c.newChat(); enter(); }}><SquarePen size={18} />新对话</button>
    <div className="sidebar-section-label" aria-hidden="true">导航</div>
    <nav className="product-nav" aria-label="功能导航">
      {[...mainNavItems, ...(isAdmin ? [adminNavItem] : [])].map(item => <Link key={item.href} href={item.href} className="footer-link" aria-current={pathname === item.href ? "page" : undefined} onClick={onClose}>
        <item.icon size={19} /><span>{item.label}</span>{item.href === "/memory" && pendingCandidateCount > 0 && <span className="footer-badge">{pendingCandidateCount}</span>}
      </Link>)}
    </nav>
    <div className="sidebar-history-head">最近对话</div>
    <nav className="conversation-list" aria-label="历史会话">
      {c.historyError && <div className="history-error" role="alert">{c.historyError}<button onClick={() => void c.reloadConversations()}>重试</button></div>}
      {c.conversations.map(conv => <div key={conv.id} className={`conversation-item ${c.activeConversationId === conv.id ? "active" : ""}`}>
        {editing === conv.id ? <form className="rename-input-wrapper" onSubmit={e => { e.preventDefault(); if (title.trim()) { void c.renameConversation(conv.id, title.trim()); setEditing(null); } }}>
          <input className="rename-input" aria-label="会话名称" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} autoFocus onKeyDown={e => { if (e.key === "Escape") setEditing(null); }} />
          <button aria-label="保存名称"><Check size={15}/></button><button type="button" onClick={() => setEditing(null)} aria-label="取消重命名"><X size={15}/></button>
        </form> : deleting === conv.id ? <div className="conversation-delete-confirm"><span>删除这条对话？</span><button onClick={() => { void c.deleteConversation(conv.id); setDeleting(null); }}>删除</button><button onClick={() => setDeleting(null)}>取消</button></div> : <>
          <button className="conversation-title-btn" aria-current={c.activeConversationId === conv.id ? "true" : undefined} title={conv.title} onClick={() => { void c.openHistory(conv.id); enter(); }}><MessageSquareText size={16}/><span className="conv-title">{conv.title || "新对话"}</span></button>
          <div className="conversation-actions"><button className="action-btn" aria-label={`重命名 ${conv.title}`} onClick={() => { setEditing(conv.id); setTitle(conv.title); }}><Pencil size={13}/></button><button className="action-btn" aria-label={`删除 ${conv.title}`} onClick={() => setDeleting(conv.id)}><Trash2 size={13}/></button></div>
        </>}
      </div>)}
      {!c.conversations.length && !c.historyError && <p className="empty-list-hint">从一个问题，开始新的对话。</p>}
    </nav>
    <div className="sidebar-user">
      {avatar
        ? <span className="sidebar-user-avatar"><Image src={avatar} alt="" width={34} height={34} unoptimized /></span>
        : <span className="sidebar-user-avatar">{displayName.slice(0, 1)}</span>}
      <span className="user-name">{displayName}</span>
      <Link href="/settings" className="sidebar-icon" aria-label="设置"><Settings size={18}/></Link>
      <button className="sidebar-icon" aria-label="退出登录" onClick={async () => { const r = await fetch("/api/auth/logout", { method: "POST" }); if (r.ok) { c.reset(); router.push("/login"); } }}><LogOut size={17}/></button>
    </div>
  </aside>;
}
