"use client";
import { TrainingControls } from "./training-controls";
import type { SimulationSessionDto } from "@/lib/workspace-types";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Menu, UserRoundPen } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductSidebar } from "@/components/shell/product-sidebar";
import { useAssistantControllerContext } from "./assistant-provider";
import { ChatThread } from "./chat-thread";
import { ChatComposer } from "./chat-composer";
import { GrowthProfileDrawer } from "./growth-profile-drawer";
import { ProfileChatWelcome } from "./profile-chat-welcome";
import { ProfileOnboardingChat } from "./profile-onboarding-chat";
import "./profile-chat.css";

export function ChatHomePage({
  initialConversationId = null,
  displayName,
  avatar = null,
  isAdmin = false,
  profileCompleted = true,
  jobId = null,
  jobIntent = null,
}: {
  initialConversationId?: string | null;
  userId: string;
  displayName: string;
  avatar?: string | null;
  isAdmin?: boolean;
  profileCompleted?: boolean;
  openChatEntry?: boolean;
  jobId?: string | null;
  jobIntent?: string | null;
}) {
  const c = useAssistantControllerContext();
  const searchParams = useSearchParams();
  const profileRequested = searchParams.get("intent") === "profile";
  const profileFlow = searchParams.get("intent") === "onboarding" || (profileRequested && !profileCompleted);
  const [profileSaved, setProfileSaved] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [training, setTraining] = useState<SimulationSessionDto | null>(null);
  const [conversationContext, setConversationContext] = useState<{ id: string; status: "loading" | "ready" | "failed" } | null>(null);
  const onContextStatus = useCallback((id: string, status: "loading" | "ready" | "failed") => setConversationContext({ id, status }), []);
  const openedId = useRef<string | null>(null);
  const { openHistory, loadingHistory, reloadConversations } = c;
  useEffect(() => {
    if (profileFlow || !initialConversationId || loadingHistory || openedId.current === initialConversationId) return;
    openedId.current = initialConversationId;
    void openHistory(initialConversationId);
    void reloadConversations();
  }, [profileFlow, initialConversationId, loadingHistory, openHistory, reloadConversations]);
  const router = useRouter();
  const jobActionHandled = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const title = c.conversations.find(item => item.id === c.activeConversationId)?.title;
  const needsFreshProfileChat = profileRequested && training && training.status !== "completed";
  const profileContextPending = profileRequested && Boolean(c.activeConversationId)
    && (conversationContext?.id !== c.activeConversationId || conversationContext?.status !== "ready");

  function chooseProfilePrompt(text: string) {
    c.setDraft(text);
    document.querySelector<HTMLTextAreaElement>(".primary-chat .composer-input")?.focus();
  }

  useEffect(() => {
    if (profileFlow || profileRequested || !jobId || jobActionHandled.current || c.loadingHistory || c.streaming) return;
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
  }, [c, jobId, jobIntent, profileFlow, profileRequested, router]);

  return <div className="chat-home-layout primary-chat" data-testid="app-shell" data-profile-entry={profileRequested || profileFlow ? "true" : undefined}>
    {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="关闭菜单"/>}
    <ProductSidebar variant="chat" displayName={displayName} avatar={avatar} isAdmin={isAdmin} open={sidebarOpen} onClose={closeSidebar}/>
    <main className="chat-main" data-testid="page-content">
      <header className="chat-topbar"><button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="打开菜单" aria-expanded={sidebarOpen} aria-controls="primary-sidebar"><Menu size={20}/></button><span className="topbar-title">{profileFlow ? "完善个人画像" : title || "AI 对话"}</span><div className="chat-topbar-actions">
        {profileRequested || profileFlow ? <Link className="profile-entry-link" href="/chat" aria-label="返回自由对话"><ArrowLeft size={17}/><span>自由对话</span></Link> : <Link className="profile-entry-link" href="/chat?intent=profile" aria-label="在对话中完善画像"><UserRoundPen size={17}/><span>完善画像</span></Link>}
        <button className="profile-toggle" onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}><FileText size={18}/>成长档案</button>
      </div></header>
      {profileSaved && <div className="profile-chat-banner" role="status"><span>画像已保存，可以继续聊目标、学习或下一步计划。</span><button type="button" onClick={() => setProfileSaved(false)}>知道了</button></div>}
      {profileFlow ? <ProfileOnboardingChat onComplete={() => { setProfileSaved(true); router.replace("/chat"); router.refresh(); }} /> : <>
      <TrainingControls key={c.activeConversationId} onBusyChange={setTrainingBusy} conversationId={c.activeConversationId} streaming={c.streaming} onTrainingChange={setTraining} onContextStatus={onContextStatus} onReload={async () => { if (c.activeConversationId) await c.openHistory(c.activeConversationId); }}/>
      {profileContextPending && !c.streaming && <div className="profile-chat-banner" role="status"><span>{conversationContext?.status === "failed" ? "当前对话状态未能读取，可另开对话完善画像。" : "正在确认当前对话状态…"}</span>{conversationContext?.status === "failed" && <button type="button" onClick={() => { c.newChat(); router.push("/chat?intent=profile"); }}>另开对话完善画像</button>}</div>}
      {needsFreshProfileChat && <div className="profile-chat-banner"><span>当前正在进行模拟训练，可另开对话完善画像，训练记录会保留。</span><button type="button" onClick={() => { c.newChat(); router.push("/chat?intent=profile"); }}>另开对话完善画像</button></div>}
      {profileRequested && !needsFreshProfileChat && c.messages.length > 0 && <div className="profile-chat-banner"><span>直接在对话中补充画像，也可以继续聊其他话题。</span><Link href="/memory?tab=profile">查看已保存画像</Link></div>}
      <div className="chat-scroll-area">
        {c.loadingHistory ? <div className="chat-loading" role="status">正在读取对话…</div> : <ChatThread messages={c.messages} activeConversationId={c.activeConversationId} onNewChat={text => { if (text) void c.send(text); else c.newChat(); }} onQuickAction={(id, text) => void c.send(text, id)} streaming={c.streaming} welcome={profileRequested && !needsFreshProfileChat ? <ProfileChatWelcome onChoose={chooseProfilePrompt} /> : undefined}/>}
      </div>
      {c.error && <div className="chat-feedback" role="alert"><span>{c.error}</span><button onClick={() => { if (c.draft) void c.retry(c.draft); else if (c.activeConversationId) void c.openHistory(c.activeConversationId); }}>重试</button></div>}
      <ChatComposer minLength={training?.status === "active" ? 5 : 1} maxLength={training?.status === "active" ? 4000 : 8000} placeholder={profileRequested && !needsFreshProfileChat ? "补充画像信息…" : training ? (training.status === "completed" ? "询问报告中的建议，讨论下一次如何改进…" : "输入你的训练回答（至少 5 个字）…") : undefined} onSend={text => void c.send(text, undefined, profileRequested ? { surface: "onboarding", action: "message_submit" } : undefined)} disabled={Boolean(needsFreshProfileChat) || profileContextPending || trainingBusy || c.streaming || c.loadingHistory || (!!training && training.status !== "completed" && training.turnCount >= (training.roundLimit ?? 6))} activeConversationId={c.activeConversationId} value={c.draft} onChange={c.setDraft}/>
      </>}
    </main>
    <GrowthProfileDrawer open={drawerOpen} onClose={closeDrawer} pendingCandidateCount={0}/>
  </div>;
}
