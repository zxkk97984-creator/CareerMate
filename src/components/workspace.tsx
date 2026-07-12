"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Database,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Route,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { SimulationView } from "@/features/simulation/simulation-view";
import { ChatView } from "@/features/chat/chat-view";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { OnboardingView } from "@/features/onboarding/onboarding-view";
import { PathView } from "@/features/path/path-view";
import { ResourceView } from "@/features/resources/resource-view";
import { MemoryView } from "@/features/memory/memory-view";
import { AdminView } from "@/features/admin/admin-view";
import { formatAiRuntimeBadge, type AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiExecutionMeta, CareerPlanDto, ProfileDto, ResourceItemDto } from "@/lib/types";
import { fetchApi } from "@/lib/client-api";
import type { View, MatchData, ProgressLogData, WorkspaceData } from "@/lib/workspace-types";

const navItems: Array<{ href: string; view: View; label: string; icon: React.ElementType }> = [
  { href: "/dashboard", view: "dashboard", label: "成长仪表盘", icon: LayoutDashboard },
  { href: "/onboarding", view: "onboarding", label: "画像引导", icon: GraduationCap },
  { href: "/path", view: "path", label: "职业路径", icon: Route },
  { href: "/simulation", view: "simulation", label: "模拟训练", icon: BrainCircuit },
  { href: "/resources", view: "resources", label: "资源中心", icon: Database },
  { href: "/memory", view: "memory", label: "记忆权限", icon: ShieldCheck },
  { href: "/", view: "chat", label: "AI 聊天", icon: MessageSquareText },
  { href: "/admin", view: "admin", label: "Admin", icon: UserCog },
];

export function Workspace({ initialView, isAdmin = false }: { initialView: View; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
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
    const active = navItems.find((item) => item.href === pathname);
    return active?.view ?? view;
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

  async function logout() {
    await fetchApi("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (loading || !data.user || !data.profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb]">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">正在加载 CareerMate 工作台...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[248px_1fr]">
        <nav className="border-r border-slate-200 bg-white px-4 py-5">
          <div className="mb-7 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Bot size={22} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-950">CareerMate</div>
              <div className="text-xs text-slate-500">职业导航系统</div>
            </div>
          </div>
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.view;
              if (item.view === "admin" && !isAdmin) return null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                    active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <button onClick={logout} className="mt-8 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-500 hover:bg-slate-100">
            <LogOut size={18} />
            退出登录
          </button>
        </nav>

        <div className="px-5 py-5 lg:px-8">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">{data.profile.targetRoleLabel} 成长工作台</h1>
              <p className="mt-1 text-sm text-slate-500">
                {data.user.displayName} · {data.profile.major || "未填写专业"} · 每周 {data.profile.weeklyAvailableHours} 小时
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
              <Gauge size={18} />
              {formatAiRuntimeBadge(aiExecution)}
            </div>
          </header>

          {/* 状态提示（辅助技术可见） */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">{notice}</div>

          <div className="space-y-5">
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
            {activeView === "chat" && <ChatView setNotice={setNotice} />}
            {activeView === "admin" && <AdminView drafts={data.drafts} templates={data.templates} refresh={loadAll} setNotice={setNotice} />}
          </div>
        </div>
      </div>
    </main>
  );
}
