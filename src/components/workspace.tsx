"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Gauge, Menu } from "lucide-react";
import { SimulationView } from "@/features/simulation/simulation-view";
// 旧 ChatView 已废弃，请使用 src/components/chat/chat-home.tsx 的主聊天入口
// import { ChatView } from "@/features/chat/chat-view";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { OnboardingView } from "@/features/onboarding/onboarding-view";
import { PathView } from "@/features/path/path-view";
import { ResourceView } from "@/features/resources/resource-view";
import { MemoryView } from "@/features/memory/memory-view";
import { AdminView } from "@/features/admin/admin-view";
import { ProductSidebar } from "@/components/shell/product-sidebar";
import { PageHeader } from "@/components/shell/page-header";
import { formatAiRuntimeBadge, type AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiExecutionMeta, CareerPlanDto, ProfileDto, ResourceItemDto } from "@/lib/types";
import { fetchApi } from "@/lib/client-api";
import type { View, MatchData, ProgressLogData, WorkspaceData } from "@/lib/workspace-types";

/** URL 路径 → 视图标识映射（用于根据当前路由决定渲染哪个视图组件） */
const VIEW_BY_PATH: Record<string, View> = {
  "/dashboard": "dashboard",
  "/onboarding": "onboarding",
  "/path": "path",
  "/simulation": "simulation",
  "/resources": "resources",
  "/memory": "memory",
  "/admin": "admin",
  "/": "chat",
};

export function Workspace({ initialView, isAdmin = false }: { initialView: View; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view] = useState<View>(initialView);
  const [data, setData] = useState<WorkspaceData>({
    user: null,
    profile: null,
    plan: null,
    pendingPlan: null,
    planExecutionMeta: null,
    resources: [],
    memories: [],
    candidates: [],
    simulations: [],
    drafts: [],
    templates: [],
    match: null,
    recentProgressLogs: [],
    aiRuntime: {
      requestedMode: "mock",
      actualMode: "mock",
      degraded: false,
      fallbackReason: null,
      source: "runtime-config",
    },
    activeOnboardingConversation: null,
  });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("正在读取成长档案...");
  const [aiExecution, setAiExecution] = useState<AiRuntimeSnapshot>({
    requestedMode: "mock",
    actualMode: "mock",
    degraded: false,
    fallbackReason: null,
    source: "runtime-config",
  });

  const activeView = useMemo(() => {
    return VIEW_BY_PATH[pathname] ?? view;
  }, [pathname, view]);

  async function loadAll() {
    setLoading(true);
    const me = await fetchApi<{
      user: WorkspaceData["user"];
      profile: ProfileDto | null;
      match: MatchData | null;
      recentProgressLogs: ProgressLogData[];
      aiRuntime: AiRuntimeSnapshot;
      activeOnboardingConversation: ActiveOnboardingConversation | null;
    }>("/api/me");
    if (!me.ok) {
      router.push("/login");
      return;
    }
    const [plan, resources, memories, candidates, simulations, admin] = await Promise.all([
      fetchApi<{ plan: CareerPlanDto | null; pendingPlan: CareerPlanDto | null; executionMeta: AiExecutionMeta | null }>("/api/plans/current"),
      fetchApi<{ items: ResourceItemDto[] }>("/api/resources"),
      fetchApi<{ items: any[] }>("/api/memories"),
      fetchApi<{ items: any[] }>("/api/profile/candidates"),
      fetchApi<{ items: any[] }>("/api/simulations"),
      isAdmin ? fetchApi<{ drafts: any[]; templates: any[] }>("/api/admin/role-drafts") : Promise.resolve({ ok: true, data: { drafts: [], templates: [] } }),
    ]);
    setData({
      user: me.data.user,
      profile: me.data.profile,
      plan: plan.ok ? plan.data.plan : null,
      pendingPlan: plan.ok ? plan.data.pendingPlan : null,
      planExecutionMeta: plan.ok ? plan.data.executionMeta : null,
      resources: resources.ok ? resources.data.items : [],
      memories: memories.ok ? memories.data.items : [],
      candidates: candidates.ok ? candidates.data.items : [],
      simulations: simulations.ok ? simulations.data.items : [],
      drafts: admin.ok ? admin.data.drafts : [],
      templates: admin.ok ? admin.data.templates : [],
      match: me.data.match,
      recentProgressLogs: me.data.recentProgressLogs,
      aiRuntime: me.data.aiRuntime,
      activeOnboardingConversation: me.data.activeOnboardingConversation,
    });
    setAiExecution(me.data.aiRuntime);
    setLoading(false);
    setNotice("CareerMate 已准备好，可以继续推进你的本月任务。");
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !data.user || !data.profile) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cm-canvas)" }}>
        <div style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)", padding: "20px 24px", fontSize: 14, color: "var(--cm-text-muted)", boxShadow: "var(--cm-shadow-card)" }}>正在加载 CareerMate 工作台...</div>
      </main>
    );
  }

  const pendingCandidateCount = data.candidates.filter((c: any) => c.status === "pending").length;

  return (
    <div className="chat-home-layout" data-testid="app-shell">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 统一侧栏 */}
      <ProductSidebar
        variant="workspace"
        displayName={data.user.displayName}
        isAdmin={isAdmin}
        pendingCandidateCount={pendingCandidateCount}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 主内容区 */}
      <main className="chat-main" data-testid="page-content">
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

        {/* 可滚动主内容（移动端预留菜单按钮空间） */}
        <div className="pt-12 md:pt-0 px-4 pb-5" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 20, maxWidth: "var(--cm-content-max)", margin: "0 auto", width: "100%" }}>
          {/* 页面标题 */}
          <PageHeader
            title={`${data.profile.targetRoleLabel} 成长工作台`}
            description={`${data.user.displayName} · ${data.profile.major || "未填写专业"} · 每周 ${data.profile.weeklyAvailableHours} 小时`}
            aiStatus={
              <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: "6px 12px", fontSize: 13, color: "var(--cm-text-muted)" }}>
                <Gauge size={16} />
                {formatAiRuntimeBadge(aiExecution)}
              </div>
            }
          />

          {/* 状态提示（辅助技术可见） */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">{notice}</div>

          {/* 视图内容 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {activeView === "dashboard" && <DashboardView data={data} refresh={loadAll} setNotice={setNotice} />}
          {activeView === "onboarding" && (
            <OnboardingView
              refresh={loadAll}
              setNotice={setNotice}
              setAiExecution={setAiExecution}
              activeConversation={data.activeOnboardingConversation}
            />
          )}
          {activeView === "path" && <PathView plan={data.plan} pendingPlan={data.pendingPlan} executionMeta={data.planExecutionMeta} refresh={loadAll} setNotice={setNotice} />}
          {activeView === "simulation" && <SimulationView simulations={data.simulations} refresh={loadAll} setNotice={setNotice} />}
          {activeView === "resources" && <ResourceView resources={data.resources} profile={data.profile} weakAbilities={data.match?.weakAbilities ?? []} />}
          {activeView === "memory" && <MemoryView memories={data.memories} candidates={data.candidates} memoryEnabled={data.profile.memoryEnabled} refresh={loadAll} setNotice={setNotice} />}
          {activeView === "chat" && (
            <div className="p-8 text-center text-muted-foreground">
              聊天功能已迁移到首页，请返回首页开始对话。
            </div>
          )}
          {activeView === "admin" && <AdminView drafts={data.drafts} templates={data.templates} refresh={loadAll} setNotice={setNotice} />}
          </div>
        </div>
      </main>
    </div>
  );
}
