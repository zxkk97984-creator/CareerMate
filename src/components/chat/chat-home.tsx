"use client";
import { useCallback, useState } from "react";
import { FileText, Menu } from "lucide-react";
import { ProductSidebar } from "@/components/shell/product-sidebar";
import { useAssistantControllerContext } from "./assistant-provider";
import { ChatThread } from "./chat-thread";
import { ChatComposer } from "./chat-composer";
import { GrowthProfileDrawer } from "./growth-profile-drawer";

export function ChatHomePage({ displayName, avatar = null, isAdmin = false }: { userId: string; displayName: string; avatar?: string | null; isAdmin?: boolean; openChatEntry?: boolean }) {
  const c = useAssistantControllerContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const title = c.conversations.find(item => item.id === c.activeConversationId)?.title;
  return <div className="chat-home-layout primary-chat" data-testid="app-shell">
    {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单"/>}
    <ProductSidebar variant="chat" displayName={displayName} avatar={avatar} isAdmin={isAdmin} open={sidebarOpen} onClose={closeSidebar}/>
    <main className="chat-main" data-testid="page-content">
      <header className="chat-topbar"><button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="打开菜单" aria-expanded={sidebarOpen} aria-controls="primary-sidebar"><Menu size={20}/></button><span className="topbar-title">{title || "AI 对话"}</span><button className="profile-toggle" onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}><FileText size={18}/>成长档案</button></header>
      <div className="chat-scroll-area">
        {c.loadingHistory ? <div className="chat-loading" role="status">正在读取对话…</div> : <ChatThread messages={c.messages} activeConversationId={c.activeConversationId} onNewChat={text => { if (text) void c.send(text); else c.newChat(); }} onQuickAction={(id, text) => void c.send(text, id)} streaming={c.streaming}/>}
      </div>
      {c.error && <div className="chat-feedback" role="alert"><span>{c.error}</span><button onClick={() => { if (c.draft) void c.retry(c.draft); else if (c.activeConversationId) void c.openHistory(c.activeConversationId); }}>重试</button></div>}
      <ChatComposer onSend={text => void c.send(text)} disabled={c.streaming || c.loadingHistory} activeConversationId={c.activeConversationId} value={c.draft} onChange={c.setDraft}/>
    </main>
    <GrowthProfileDrawer open={drawerOpen} onClose={closeDrawer} pendingCandidateCount={0}/>
  </div>;
}
