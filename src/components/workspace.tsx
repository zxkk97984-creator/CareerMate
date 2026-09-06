"use client";

import { usePathname } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import { SimulationView } from "@/features/simulation/simulation-view";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { OnboardingView } from "@/features/onboarding/onboarding-view";
import { PathView } from "@/features/path/path-view";
import { ResourceView } from "@/features/resources/resource-view";
import { MemoryView } from "@/features/memory/memory-view";
import { AdminView } from "@/features/admin/admin-view";
import { ProductSidebar } from "@/components/shell/product-sidebar";
import { AssistantEntryButton } from "@/components/shell/assistant-entry-button";
import { PageHeader } from "@/components/shell/page-header";
import { useWorkspaceData, type ModuleKey } from "@/hooks/use-workspace-data";
import type { View } from "@/lib/workspace-types";

/** URL 路径 → 视图标识映射（用于根据当前路由决定渲染哪个视图组件） */
const VIEW_BY_PATH: Record<string, View> = {
  "/dashboard": "dashboard",
  "/onboarding": "onboarding",
  "/path": "path",
  "/simulation": "simulation",
  "/resources": "resources",
  "/memory": "memory",
  "/admin": "admin",
};

const MODULE_LABEL: Record<ModuleKey, string> = {
  plan: "计划",
  resources: "资源",
  memories: "记忆",
  candidates: "建议",
  v2Candidates: "建议",
  simulations: "训练",
  admin: "草稿",
};

export function Workspace({ initialView, isAdmin = false }: { initialView: View; isAdmin?: boolean }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view] = useState<View>(initialView);
  const activeView = useMemo(() => VIEW_BY_PATH[pathname] ?? view, [pathname, view]);
  const { state, setNotice, updateAiRuntime, refresh, refreshSlices, retryFatal } = useWorkspaceData(activeView);
  const { data, initialLoading, refreshing, fatal, moduleErrors, notice } = state;

  // 首次加载且尚无数据：整页骨架；fatal 时保留壳并显示重试
  if (initialLoading && !data.user) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cm-canvas)" }}>
        <div className="cm-loading" style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)", padding: "20px 24px", fontSize: 14, color: "var(--cm-text-muted)", boxShadow: "var(--cm-shadow-card)" }}>
          <span className="cm-spinner" aria-hidden="true" />
          正在读取你的成长记录...
        </div>
      </main>
    );
  }

  if (!data.user || !data.profile) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cm-canvas)" }}>
        <div className="cm-loading" style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", background: "var(--cm-surface)", padding: "24px 28px", fontSize: 14, color: "var(--cm-text-strong)", boxShadow: "var(--cm-shadow-card)", maxWidth: 420 }}>
          <p>你的成长记录暂时未能加载。</p>
          <p style={{ color: "var(--cm-text-muted)", margin: "8px 0 16px" }}>{fatal ?? "请检查网络后重试。"}</p>
          <button type="button" style={{ minHeight: 44, padding: "0 16px", borderRadius: "var(--cm-radius-control)", background: "var(--cm-brand, #0E76FF)", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer" }} onClick={() => void retryFatal()}>
            重试加载
          </button>
        </div>
      </main>
    );
  }

  const pendingCandidateCount = (data.candidates || []).filter((c: any) => c.status === "pending").length
    + (data.v2CandidateTotal ?? (data.v2Candidates ?? []).length)
    + (data.pendingPlan ? 1 : 0); // pending 计划计入待确认，保持概览/路径/建议中心一致

  const failedModules = (Object.keys(moduleErrors) as ModuleKey[]).filter((k) => moduleErrors[k]);

  return (
    <div
      className="chat-home-layout"
      data-testid="app-shell"
      data-ai-mode={data.aiRuntime.actualMode}
    >
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
        {/* 移动端顶部工具条 */}
        <header className="chat-topbar workspace-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-expanded={sidebarOpen}
            aria-controls="primary-sidebar"
            aria-label="打开菜单"
          >
            <Menu size={20} />
          </button>
          <span className="topbar-title">工作台</span>
          {refreshing && <span className="workspace-refreshing" aria-live="polite">正在更新</span>}
        </header>

        {/* 可滚动主内容（移动端预留菜单按钮空间） */}
        <div className="pt-4 md:pt-0 px-4 pb-5" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 20, maxWidth: "var(--cm-content-max)", margin: "0 auto", width: "100%" }}>
          {/* 页面标题 */}
          <PageHeader
            title={`${data.profile.targetRoleLabel ?? "未设置目标岗位"} 成长工作台`}
            description={`${data.user.displayName} · ${data.profile.major || "未填写专业"} · 每周 ${data.profile.weeklyAvailableHours ?? 0} 小时`}
            actions={<AssistantEntryButton />}
          />

          {/* 局部模块失败：就地提示 + 重试，不阻断其他模块、不伪装成空列表 */}
          {failedModules.length > 0 && (
            <div className="workspace-module-error" role="alert">
              <span>{failedModules.map((k) => MODULE_LABEL[k]).join("、")}未能加载。</span>
              <button
                type="button"
                className="workspace-module-retry"
                onClick={() => { void refreshSlices(failedModules); }}
              >
                <RefreshCw size={14} /> 重试
              </button>
            </div>
          )}

          {/* 状态提示（辅助技术可见） */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">{notice}</div>

          {/* 视图内容 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {activeView === "dashboard" && <DashboardView data={data} refresh={refresh} setNotice={setNotice} />}
          {activeView === "onboarding" && (
            <OnboardingView
              refresh={refresh}
              setNotice={setNotice}
              setAiExecution={updateAiRuntime}
              activeConversation={data.activeOnboardingConversation}
            />
          )}
          {activeView === "path" && <PathView plan={data.plan} pendingPlan={data.pendingPlan} executionMeta={data.planExecutionMeta} refresh={refresh} setNotice={setNotice} />}
          {activeView === "simulation" && <SimulationView simulations={data.simulations} profile={data.profile} refresh={refresh} setNotice={setNotice} />}
          {activeView === "resources" && (
            <Suspense fallback={null}>
              <ResourceView resources={data.resources} profile={data.profile} weakAbilities={data.match?.weakAbilities ?? []} />
            </Suspense>
          )}
          {activeView === "memory" && (
            <Suspense fallback={null}>
              <MemoryView memories={data.memories} candidates={data.candidates} v2Candidates={data.v2Candidates} profile={data.profile} memoryEnabled={data.profile.memoryEnabled} refresh={refresh} setNotice={setNotice} />
            </Suspense>
          )}
          {activeView === "admin" && <AdminView drafts={data.drafts} templates={data.templates} refresh={refresh} setNotice={setNotice} />}
          </div>
        </div>
      </main>
    </div>
  );
}
