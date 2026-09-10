"use client";
import { TrainingControls } from "./training-controls";
import type { SimulationSessionDto } from "@/lib/workspace-types";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProductSidebar } from "@/components/shell/product-sidebar";
import { useAssistantControllerContext } from "./assistant-provider";
import { ChatThread } from "./chat-thread";
import { ChatComposer } from "./chat-composer";
import { GrowthProfileDrawer } from "./growth-profile-drawer";

export function ChatHomePage({
  initialConversationId = null,
  displayName,
  avatar = null,
  isAdmin = false,
  jobId = null,
  jobIntent = null,
}: {
  initialConversationId?: string | null;
  userId: string;
  displayName: string;
  avatar?: string | null;
  isAdmin?: boolean;
  openChatEntry?: boolean;
  jobId?: string | null;
  jobIntent?: string | null;
}) {
  const c = useAssistantControllerContext();
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [training, setTraining] = useState<SimulationSessionDto | null>(null);
  const openedId = useRef<string | null>(null);
  const { openHistory, loadingHistory, reloadConversations } = c;
  useEffect(() => {
    if (!initialConversationId || loadingHistory || openedId.current === initialConversationId) return;
    openedId.current = initialConversationId;
    void openHistory(initialConversationId);
    void reloadConversations();
  }, [initialConversationId, loadingHistory, openHistory, reloadConversations]);
  const router = useRouter();
  const jobActionHandled = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const title = c.conversations.find(item => item.id === c.activeConversationId)?.title;

  useEffect(() => {
    if (!jobId || jobActionHandled.current || c.loadingHistory || c.streaming) return;
    jobActionHandled.current = true;
    const isPlanAdjustment = jobIntent === "plan-adjust";
    const prompt = isPlanAdjustment
      ? `请基于岗位样本 ${jobId} 的 JD 和技能要求，结合我的画像与当前计划，判断需要调整哪些学习任务，并给出可确认的计划候选。`
      : `请基于岗位样本 ${jobId} 的 JD 和技能要求，结合我的画像与能力证据做差距分析，说明已具备、待补充和需要验证的部分。`;
    void c.send(prompt, undefined, {
      surface: "resources",
      action: isPlanAdjustment ? "adjust_plan_for_job" : "analyze_job_gap",
      targetRef: jobId,
    });
    router.replace("/chat", { scroll: false });
  }, [c, jobId, jobIntent, router]);

  return <div className="chat-home-layout primary-chat" data-testid="app-shell">
    {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单"/>}
    <ProductSidebar variant="chat" displayName={displayName} avatar={avatar} isAdmin={isAdmin} open={sidebarOpen} onClose={closeSidebar}/>
    <main className="chat-main" data-testid="page-content">
      <header className="chat-topbar"><button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="打开菜单" aria-expanded={sidebarOpen} aria-controls="primary-sidebar"><Menu size={20}/></button><span className="topbar-title">{title || "AI 对话"}</span><button className="profile-toggle" onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}><FileText size={18}/>成长档案</button></header>
      <TrainingControls key={c.activeConversationId} onBusyChange={setTrainingBusy} conversationId={c.activeConversationId} streaming={c.streaming} onTrainingChange={setTraining} onReload={async () => { if (c.activeConversationId) await c.openHistory(c.activeConversationId); }}/>
      <div className="chat-scroll-area">
        {c.loadingHistory ? <div className="chat-loading" role="status">正在读取对话…</div> : <ChatThread messages={c.messages} activeConversationId={c.activeConversationId} onNewChat={text => { if (text) void c.send(text); else c.newChat(); }} onQuickAction={(id, text) => void c.send(text, id)} streaming={c.streaming}/>}
      </div>
      {c.error && <div className="chat-feedback" role="alert"><span>{c.error}</span><button onClick={() => { if (c.draft) void c.retry(c.draft); else if (c.activeConversationId) void c.openHistory(c.activeConversationId); }}>重试</button></div>}
      <ChatComposer minLength={training?.status === "active" ? 5 : 1} maxLength={training?.status === "active" ? 4000 : 8000} placeholder={training ? (training.status === "completed" ? "询问报告中的建议，讨论下一次如何改进…" : "输入你的训练回答（至少 5 个字）…") : undefined} onSend={text => void c.send(text)} disabled={trainingBusy || c.streaming || c.loadingHistory || (!!training && training.status !== "completed" && training.turnCount >= (training.roundLimit ?? 6))} activeConversationId={c.activeConversationId} value={c.draft} onChange={c.setDraft}/>
    </main>
    <GrowthProfileDrawer open={drawerOpen} onClose={closeDrawer} pendingCandidateCount={0}/>
  </div>;
}
