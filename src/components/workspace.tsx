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
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import {
  formatAiRuntimeBadge,
  formatAiRuntimeDescription,
  type AiRuntimeSnapshot,
} from "@/lib/ai-runtime";
import { canCompleteOnboarding, type OnboardingDraft } from "@/lib/onboarding";
import {
  createOnboardingInitialState,
  type ActiveOnboardingConversation,
} from "@/lib/onboarding-resume";
import { consumeFrontendSseResponse } from "@/lib/tbox/frontend-sse";
import { abilityKeys, abilityLabels, type AiExecutionMeta, type ProfileDto } from "@/lib/types";

type View = "onboarding" | "dashboard" | "path" | "simulation" | "resources" | "memory" | "chat" | "admin";

interface ApiPayload<T> {
  ok: boolean;
  data: T;
  error?: { message: string };
  meta?: AiExecutionMeta;
}

interface MatchData {
  score: number;
  explanation: string;
  weakAbilities: Array<(typeof abilityKeys)[number]>;
}

interface ProgressLogData {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  createdAt: string;
}

interface WorkspaceData {
  user: { id: string; displayName: string; username: string; role: string } | null;
  profile: ProfileDto | null;
  plan: any | null;
  resources: any[];
  memories: any[];
  candidates: any[];
  simulations: any[];
  drafts: any[];
  templates: any[];
  match: MatchData | null;
  recentProgressLogs: ProgressLogData[];
  aiRuntime: AiRuntimeSnapshot;
  activeOnboardingConversation: ActiveOnboardingConversation | null;
}

const navItems: Array<{ href: string; view: View; label: string; icon: React.ElementType }> = [
  { href: "/dashboard", view: "dashboard", label: "成长仪表盘", icon: LayoutDashboard },
  { href: "/onboarding", view: "onboarding", label: "画像引导", icon: GraduationCap },
  { href: "/path", view: "path", label: "职业路径", icon: Route },
  { href: "/simulation", view: "simulation", label: "模拟训练", icon: BrainCircuit },
  { href: "/resources", view: "resources", label: "资源中心", icon: Database },
  { href: "/memory", view: "memory", label: "记忆权限", icon: ShieldCheck },
  { href: "/chat", view: "chat", label: "AI 聊天", icon: MessageSquareText },
  { href: "/admin", view: "admin", label: "Admin", icon: UserCog },
];

const scenarios = [
  {
    key: "cross_role_communication",
    title: "跨岗位沟通",
    prompt: "你需要向技术负责人说明一个 AI 简历分析功能。请写出你的需求说明和需要澄清的问题。",
  },
  {
    key: "ai_office",
    title: "AI 辅助办公",
    prompt: "请把一次产品例会整理成行动项，并说明你会如何用 AI 工具提升效率。",
  },
  {
    key: "remote_collaboration",
    title: "远程协作",
    prompt: "项目延期风险出现了。请写一段异步进度同步，说明风险、影响和下一步。",
  },
];

async function api<T>(url: string, init?: RequestInit): Promise<ApiPayload<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return response.json();
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const className =
    variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : variant === "secondary"
        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "bg-slate-950 text-white hover:bg-slate-800";
  return (
    <button disabled={disabled} onClick={onClick} className={`h-10 rounded-md px-4 text-sm font-semibold ${className}`}>
      {children}
    </button>
  );
}

function CareerMateCompanion({ status, runtime }: { status: string; runtime: AiRuntimeSnapshot }) {
  const mood = status.includes("完成") ? "完成" : status.includes("生成") ? "思考" : status.includes("训练") ? "鼓励" : "提醒";
  return (
    <aside className="sticky top-5 hidden w-72 self-start rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:block">
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-200 via-indigo-200 to-amber-100 p-2">
          <div className="flex h-full w-full items-center justify-center rounded-xl bg-white text-2xl shadow-inner">CM</div>
          <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-950">CareerMate</div>
          <div className="text-xs text-slate-500">{mood}状态</div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{status}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div className="rounded-md bg-slate-50 p-2">画像更新需确认</div>
        <div className="rounded-md bg-slate-50 p-2">{formatAiRuntimeDescription(runtime)}</div>
      </div>
    </aside>
  );
}

export function Workspace({ initialView }: { initialView: View }) {
  const router = useRouter();
  const pathname = usePathname();
  const [view] = useState<View>(initialView);
  const [data, setData] = useState<WorkspaceData>({
    user: null,
    profile: null,
    plan: null,
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
    const me = await api<{
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
      api<{ plan: any | null }>("/api/plans/current"),
      api<{ items: any[] }>("/api/resources"),
      api<{ items: any[] }>("/api/memories"),
      api<{ items: any[] }>("/api/profile/candidates"),
      api<{ items: any[] }>("/api/simulations"),
      me.data.user?.role === "admin" ? api<{ drafts: any[]; templates: any[] }>("/api/admin/role-drafts") : Promise.resolve({ ok: true, data: { drafts: [], templates: [] } }),
    ]);
    setData({
      user: me.data.user,
      profile: me.data.profile,
      plan: plan.ok ? plan.data.plan : null,
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
    await api("/api/auth/logout", { method: "POST" });
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
              if (item.view === "admin" && data.user?.role !== "admin") return null;
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

          <div className="grid gap-5 xl:grid-cols-[1fr_288px]">
            <div className="space-y-5">
              {activeView === "dashboard" && <Dashboard data={data} refresh={loadAll} setNotice={setNotice} />}
              {activeView === "onboarding" && (
                <Onboarding
                  refresh={loadAll}
                  setNotice={setNotice}
                  setAiExecution={setAiExecution}
                  activeConversation={data.activeOnboardingConversation}
                />
              )}
              {activeView === "path" && <PathView plan={data.plan} refresh={loadAll} setNotice={setNotice} />}
              {activeView === "simulation" && <SimulationView simulations={data.simulations} refresh={loadAll} setNotice={setNotice} />}
              {activeView === "resources" && <ResourceView resources={data.resources} profile={data.profile} />}
              {activeView === "memory" && <MemoryView memories={data.memories} candidates={data.candidates} refresh={loadAll} setNotice={setNotice} />}
              {activeView === "chat" && <ChatView setNotice={setNotice} />}
              {activeView === "admin" && <AdminView drafts={data.drafts} templates={data.templates} refresh={loadAll} setNotice={setNotice} />}
            </div>
            <CareerMateCompanion status={notice} runtime={aiExecution} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Dashboard({ data, refresh, setNotice }: { data: WorkspaceData; refresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const radar = abilityKeys.map((key) => ({ ability: abilityLabels[key], score: data.profile?.abilityScores[key] ?? 0 }));
  const currentMonth = data.plan?.months?.[Math.max((data.plan?.currentMonthIndex ?? 1) - 1, 0)];

  async function generatePlan() {
    setNotice("正在生成 3 年路径...");
    await api("/api/plans/generate", { method: "POST" });
    setNotice("3 年路径已生成，当前月任务已刷新。");
    await refresh();
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="加权岗位匹配度" value={`${data.match?.score ?? 0}%`} tone="indigo" />
        <Metric title="本月任务" value={`${currentMonth?.learningTasks?.length ?? 0} 项`} tone="emerald" />
        <Metric title="待确认画像" value={`${data.candidates.filter((item) => item.status === "pending").length} 条`} tone="amber" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <Panel title="能力雷达图" action={<Button variant="secondary" onClick={generatePlan}>重生成路径</Button>}>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar}>
                <PolarGrid />
                <PolarAngleAxis dataKey="ability" tick={{ fontSize: 12 }} />
                <Radar dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.22} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="当前月重点">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-500">目标</div>
              <div className="mt-1 text-lg font-semibold text-slate-950">{currentMonth?.goal ?? "还没有生成职业路径"}</div>
            </div>
            <div className="grid gap-3">
              {(currentMonth?.learningTasks ?? []).map((task: any) => (
                <div key={task.id} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                    <div className="text-xs text-slate-500">第 {task.dueWeek ?? "-"} 周前完成</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{task.status}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="匹配度说明">
          <p className="text-sm leading-6 text-slate-600">
            {data.match?.explanation ?? "完成画像后将生成岗位匹配度说明。"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(data.match?.weakAbilities ?? []).map((ability) => (
              <span key={ability} className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                优先提升：{abilityLabels[ability]}
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="近期成长记录">
          <div className="space-y-3">
            {data.recentProgressLogs.length === 0 ? (
              <p className="text-sm text-slate-500">还没有成长记录。</p>
            ) : (
              data.recentProgressLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">{log.title}</div>
                    <time className="text-xs text-slate-400" dateTime={log.createdAt}>
                      {new Date(log.createdAt).toLocaleDateString("zh-CN")}
                    </time>
                  </div>
                  {log.summary ? <p className="mt-1 text-xs leading-5 text-slate-500">{log.summary}</p> : null}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Metric({ title, value, tone }: { title: string; value: string; tone: "indigo" | "emerald" | "amber" }) {
  const toneMap = {
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`mt-3 inline-flex rounded-md px-3 py-2 text-2xl font-semibold ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}

interface OnboardingMessage {
  role: "user" | "assistant";
  content: string;
}

function Onboarding({
  refresh,
  setNotice,
  setAiExecution,
  activeConversation,
}: {
  refresh: () => Promise<void>;
  setNotice: (value: string) => void;
  setAiExecution: (value: AiRuntimeSnapshot) => void;
  activeConversation: ActiveOnboardingConversation | null;
}) {
  const router = useRouter();
  const initialState = createOnboardingInitialState(activeConversation);
  const [conversationId, setConversationId] = useState<string | undefined>(initialState.conversationId);
  const [draft, setDraft] = useState<OnboardingDraft>(initialState.draft);
  const [completeness, setCompleteness] = useState(initialState.completeness);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<OnboardingMessage[]>(initialState.messages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const content = message.trim();
    if (!content || loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    setMessages((current) => [...current, { role: "user", content }]);
    setNotice("CareerMate 正在整理画像信息...");
    try {
      const response = await api<{
        assistantMessage: string;
        conversationId: string;
        draft: OnboardingDraft;
        profileCompleteness: number;
      }>("/api/onboarding/chat", {
        method: "POST",
        body: JSON.stringify({ message: content, conversationId }),
      });
      if (!response.ok) throw new Error(response.error?.message ?? "画像对话失败");
      setConversationId(response.data.conversationId);
      setDraft(response.data.draft);
      setCompleteness(response.data.profileCompleteness);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: response.data.assistantMessage },
      ]);
      if (response.meta) {
        setAiExecution(response.meta);
      }
      setNotice(`画像完整度已更新到 ${Math.round(response.data.profileCompleteness * 100)}%。`);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "画像对话失败，请稍后重试";
      setError(detail);
      setMessage(content);
      setNotice("画像对话失败，你的输入已保留，可以重试。");
    } finally {
      setLoading(false);
    }
  }

  async function complete() {
    if (!conversationId || !canCompleteOnboarding(completeness) || loading) return;
    setLoading(true);
    setError("");
    setNotice("正在确认并保存职业画像...");
    try {
      const response = await api<{ alreadyCompleted: boolean }>("/api/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      if (!response.ok) throw new Error(response.error?.message ?? "画像确认失败");
      setNotice(response.data.alreadyCompleted ? "画像此前已经确认。" : "职业画像已确认，成长工作台已更新。");
      await refresh();
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "画像确认失败，请稍后重试");
      setNotice("画像尚未保存，请检查完整度后重试。");
    } finally {
      setLoading(false);
    }
  }

  const summary = [
    ["阶段", draft.educationStage],
    ["专业/背景", draft.major],
    ["目标岗位", draft.targetRoleLabel],
    ["每周投入", draft.weeklyAvailableHours ? `${draft.weeklyAvailableHours} 小时` : undefined],
    ["学习偏好", draft.learningPreference?.join("、")],
    ["相关经历", draft.experienceSummary],
    ["现实限制", draft.constraints?.join("、")],
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <Panel title="对话式画像引导">
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">画像完整度</span>
            <span className="font-semibold text-slate-950">{Math.round(completeness * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width]"
              style={{ width: `${Math.round(completeness * 100)}%` }}
            />
          </div>
        </div>
        <div className="max-h-[430px] space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-4">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 ${
                item.role === "user"
                  ? "ml-auto bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {item.content}
            </div>
          ))}
        </div>
        <textarea
          className="mt-4 min-h-24 w-full rounded-md border border-slate-200 p-3 text-sm leading-6"
          placeholder="一次可以告诉我多项信息，例如：我是大三统计学专业，想做数据分析，每周有 8 小时……"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        {error ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={loading || !message.trim()} onClick={send}>
            {loading ? "处理中..." : "发送"}
          </Button>
          <span className="text-xs text-slate-500">确认前不会改写正式画像</span>
        </div>
      </Panel>

      <Panel title="画像摘要">
        <dl className="space-y-3">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-1 text-sm text-slate-900">{value || "待补充"}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5">
          <Button disabled={loading || !conversationId || !canCompleteOnboarding(completeness)} onClick={complete}>
            确认并生成成长工作台
          </Button>
          {!canCompleteOnboarding(completeness) ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">完整度达到 80% 后可以确认。</p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function PathView({ plan, refresh, setNotice }: { plan: any | null; refresh: () => Promise<void>; setNotice: (value: string) => void }) {
  async function generatePlan() {
    setNotice("正在生成 36 个月行动计划...");
    await api("/api/plans/generate", { method: "POST" });
    setNotice("职业路径已生成。");
    await refresh();
  }
  return (
    <Panel title="3 年职业路径" action={<Button onClick={generatePlan}>{plan ? "重规划" : "生成路径"}</Button>}>
      {!plan ? (
        <div className="rounded-md bg-slate-50 p-5 text-sm text-slate-600">还没有职业路径，请先生成。</div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {plan.years.map((year: any) => (
              <div key={year.yearIndex} className="rounded-lg border border-slate-200 p-4">
                <div className="text-sm text-slate-500">第 {year.yearIndex} 年</div>
                <div className="mt-2 font-semibold text-slate-950">{year.goal}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plan.months.slice(0, 12).map((month: any) => (
              <div key={month.monthIndex} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-500">Month {month.monthIndex}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{month.goal}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function SimulationView({ simulations, refresh, setNotice }: { simulations: any[]; refresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [selected, setSelected] = useState(scenarios[0]);
  const [answer, setAnswer] = useState(scenarios[0].prompt);

  async function submit() {
    setNotice("正在评估模拟训练...");
    await api("/api/simulations", {
      method: "POST",
      body: JSON.stringify({ scenarioKey: selected.key, scenarioTitle: selected.title, userAnswer: answer }),
    });
    setNotice("训练已完成，已生成画像更新候选。");
    await refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Panel title="训练模块">
        <div className="space-y-3">
          {scenarios.map((scenario) => (
            <button
              key={scenario.key}
              onClick={() => {
                setSelected(scenario);
                setAnswer(scenario.prompt);
              }}
              className={`w-full rounded-md border p-4 text-left ${selected.key === scenario.key ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              <div className="text-sm font-semibold">{scenario.title}</div>
              <div className="mt-2 text-xs opacity-75">{scenario.prompt}</div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={selected.title}>
        <textarea className="min-h-44 w-full rounded-md border border-slate-200 p-3 text-sm leading-6" value={answer} onChange={(event) => setAnswer(event.target.value)} />
        <div className="mt-4">
          <Button onClick={submit}>提交训练</Button>
        </div>
        <div className="mt-6 space-y-3">
          {simulations.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900">{item.scenarioTitle}</div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">{item.score} 分</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ResourceView({ resources, profile }: { resources: any[]; profile: ProfileDto }) {
  const relevant = resources.filter((item) => item.roleKey === profile.targetRole || resources.length < 4);
  return (
    <Panel title="资源中心">
      <div className="grid gap-4 md:grid-cols-2">
        {relevant.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-950">{item.title}</div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{item.type}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            <div className="mt-3 text-xs text-slate-500">来源：{item.source}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MemoryView({
  memories,
  candidates,
  refresh,
  setNotice,
}: {
  memories: any[];
  candidates: any[];
  refresh: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  async function operate(candidateId: string, action: "accept" | "reject") {
    await api("/api/profile/candidates", { method: "PATCH", body: JSON.stringify({ candidateId, action }) });
    setNotice(action === "accept" ? "画像更新已确认。" : "画像更新已拒绝。");
    await refresh();
  }

  async function deleteMemory(id: string) {
    await fetch(`/api/memories?id=${id}`, { method: "DELETE" });
    setNotice("记忆已删除。");
    await refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="长期记忆">
        <div className="space-y-3">
          {memories.map((memory) => (
            <div key={memory.id} className="rounded-md border border-slate-200 p-4">
              <p className="text-sm leading-6 text-slate-700">{memory.content}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">{memory.sensitivity}</span>
                <Button variant="danger" onClick={() => deleteMemory(memory.id)}>删除</Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="画像更新候选">
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <div key={candidate.id} className="rounded-md border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">{candidate.field}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.reason}</p>
              <div className="mt-3 flex gap-2">
                <Button disabled={candidate.status !== "pending"} onClick={() => operate(candidate.id, "accept")}>确认</Button>
                <Button variant="secondary" disabled={candidate.status !== "pending"} onClick={() => operate(candidate.id, "reject")}>拒绝</Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ChatView({ setNotice }: { setNotice: (value: string) => void }) {
  const [question, setQuestion] = useState("我想转 AI 产品经理，该怎么开始？");
  const [messages, setMessages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);

  async function send() {
    setStreaming(true);
    setMessages([]);
    setNotice("CareerMate 正在思考...");
    try {
      const response = await fetch("/api/tbox/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      await consumeFrontendSseResponse(response, (content) => {
        setMessages((previous) => [...previous, content]);
      });
      setNotice("对话完成，必要时会生成画像更新候选。");
    } catch {
      setNotice("对话失败，请检查登录状态或稍后重试。你的输入已保留。");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <Panel title="独立 AI 聊天">
      <textarea className="min-h-28 w-full rounded-md border border-slate-200 p-3 text-sm leading-6" value={question} onChange={(event) => setQuestion(event.target.value)} />
      <div className="mt-4">
        <Button disabled={streaming} onClick={send}>{streaming ? "生成中..." : "发送"}</Button>
      </div>
      <div className="mt-5 space-y-3">
        {messages.map((message, index) => (
          <div key={`${message}-${index}`} className="rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {message}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AdminView({
  drafts,
  templates,
  refresh,
  setNotice,
}: {
  drafts: any[];
  templates: any[];
  refresh: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  async function createDraft() {
    await api("/api/admin/role-drafts", { method: "POST" });
    setNotice("已生成一个岗位草稿，等待审核。");
    await refresh();
  }

  async function review(id: string, action: "approve" | "reject") {
    await api("/api/admin/role-drafts", { method: "PATCH", body: JSON.stringify({ id, action }) });
    setNotice(action === "approve" ? "岗位草稿已入库。" : "岗位草稿已拒绝。");
    await refresh();
  }

  return (
    <div className="space-y-5">
      <Panel title="岗位草稿审核" action={<Button onClick={createDraft}>生成草稿</Button>}>
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4">
              <div>
                <div className="font-semibold text-slate-950">{draft.roleName}</div>
                <div className="mt-1 text-sm text-slate-500">{draft.category} · {draft.status}</div>
              </div>
              <div className="flex gap-2">
                <Button disabled={draft.status !== "pending"} onClick={() => review(draft.id, "approve")}>通过</Button>
                <Button variant="secondary" disabled={draft.status !== "pending"} onClick={() => review(draft.id, "reject")}>拒绝</Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="正式岗位库">
        <div className="grid gap-3 md:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-md border border-slate-200 p-4">
              <div className="font-semibold text-slate-950">{template.roleName}</div>
              <div className="mt-1 text-sm text-slate-500">{template.category}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
