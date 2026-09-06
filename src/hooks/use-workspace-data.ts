"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/client-api";
import type { AiRuntimeSnapshot } from "@/lib/ai-runtime";
import type { ActiveOnboardingConversation } from "@/lib/onboarding-resume";
import type { AiExecutionMeta, CareerPlanDto, ProfileDto, ResourceItemDto } from "@/lib/types";
import type { MatchData, ProgressLogData, WorkspaceData, View, V2CandidateDto } from "@/lib/workspace-types";
import { modulesForView } from "@/lib/view-modules";

/** 可独立成功/失败的业务模块。失败时保留旧数据并记录错误，不伪装为空列表。 */
export type ModuleKey =
  | "plan"
  | "resources"
  | "memories"
  | "candidates"
  | "v2Candidates"
  | "simulations"
  | "admin";

const EMPTY_RUNTIME: AiRuntimeSnapshot = {
  requestedMode: "mock",
  actualMode: "mock",
  degraded: false,
  fallbackReason: null,
  source: "runtime-config",
};

function emptyData(): WorkspaceData {
  return {
    user: null,
    profile: null,
    plan: null,
    pendingPlan: null,
    planExecutionMeta: null,
    resources: [],
    memories: [],
    candidates: [],
    v2Candidates: [],
    v2CandidateTotal: 0,
    simulations: [],
    drafts: [],
    templates: [],
    match: null,
    recentProgressLogs: [],
    aiRuntime: EMPTY_RUNTIME,
    activeOnboardingConversation: null,
  };
}

export interface WorkspaceLoadState {
  data: WorkspaceData;
  /** 仅首次且尚无数据时才显示整页骨架 */
  initialLoading: boolean;
  /** 后台刷新中（视图不卸载、内容保留，仅显示局部小状态） */
  refreshing: boolean;
  /** /api/me 失败且非 401（5xx）：保留壳并提供重试 */
  fatal: string | null;
  /** 各业务模块独立失败信息（非空 Key 表示上次该模块加载/刷新失败） */
  moduleErrors: Partial<Record<ModuleKey, string>>;
  notice: string;
}

/** me 接口返回形状（首页聚合的少量共享摘要 + 用户/画像） */
interface MePayload {
  user: WorkspaceData["user"];
  profile: ProfileDto | null;
  match: MatchData | null;
  recentProgressLogs: ProgressLogData[];
  aiRuntime: AiRuntimeSnapshot;
  activeOnboardingConversation: ActiveOnboardingConversation | null;
}

export interface UseWorkspaceData {
  state: WorkspaceLoadState;
  setNotice: (message: string) => void;
  /** 由视图在 AI 执行信息变化时更新运行时快照（如引导对话返回 execution meta）。 */
  updateAiRuntime: (meta: AiRuntimeSnapshot) => void;
  /** 后台全量刷新：任何时刻调用都不卸载当前视图、不清空输入与滚动。 */
  refresh: () => Promise<void>;
  /** 只重取失效的切片并局部合并到 data，保存后可避免整页重载。 */
  refreshSlices: (keys: ModuleKey[]) => Promise<void>;
  retryFatal: () => void;
}

export function useWorkspaceData(activeView: View): UseWorkspaceData {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData>(() => emptyData());
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [moduleErrors, setModuleErrors] = useState<Partial<Record<ModuleKey, string>>>({});
  const [notice, setNotice] = useState("正在读取成长档案...");
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);
  const activeViewRef = useRef(activeView);
  // 用 effect 同步当前视图（不在 render 期间写 ref，遵守 react-hooks/refs）
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // 先取 me：401 跳登录，其他错误保留壳（fatal）。返回成功则为 0，供 loadAll 继续。
  const loadMe = useCallback(async (): Promise<boolean> => {
    const me = await fetchApi<MePayload>("/api/me");
    if (me.ok) {
      setFatal(null);
      setData((prev) => ({
        ...prev,
        user: me.data.user,
        profile: me.data.profile,
        match: me.data.match,
        recentProgressLogs: me.data.recentProgressLogs,
        aiRuntime: me.data.aiRuntime,
        activeOnboardingConversation: me.data.activeOnboardingConversation,
      }));
      setNotice("CareerMate 已准备好，可以继续推进你的本月任务。");
      return true;
    }
    if (me.error.code === "UNAUTHORIZED") {
      // 仅明确 401 才去登录；保存现场，避免把 500 当成登录过期
      if (mountedRef.current) router.push("/login");
      return false;
    }
    if (!hasDataRef.current) setFatal(me.error.message || "无法读取你的成长记录，重试后继续");
    else setNotice("正在更新");
    return false;
  }, [router]);

  const loadModules = useCallback(async (keys: ModuleKey[]) => {
    const plan = fetchApi<{ plan: CareerPlanDto | null; pendingPlan: CareerPlanDto | null; executionMeta: AiExecutionMeta | null }>("/api/plans/current");
    const resources = fetchApi<{ items: ResourceItemDto[] }>("/api/resources");
    const memories = fetchApi<{ items: WorkspaceData["memories"] }>("/api/memories");
    const candidates = fetchApi<{ items: WorkspaceData["candidates"] }>("/api/profile/candidates");
    const v2Candidates = fetchApi<{ items: V2CandidateDto[]; total: number; nextCursor?: string | null }>("/api/agentic-v2/candidates?status=pending&limit=100");
    const simulations = fetchApi<{ items: WorkspaceData["simulations"] }>("/api/simulations");
    const admin = fetchApi<{ drafts: WorkspaceData["drafts"]; templates: WorkspaceData["templates"] }>("/api/admin/role-drafts");

    const [planR, resourcesR, memoriesR, candidatesR, v2R, simulationsR, adminR] = await Promise.all([
      keys.includes("plan") ? plan : Promise.resolve<null>(null),
      keys.includes("resources") ? resources : Promise.resolve<null>(null),
      keys.includes("memories") ? memories : Promise.resolve<null>(null),
      keys.includes("candidates") ? candidates : Promise.resolve<null>(null),
      keys.includes("v2Candidates") ? v2Candidates : Promise.resolve<null>(null),
      keys.includes("simulations") ? simulations : Promise.resolve<null>(null),
      keys.includes("admin") ? admin : Promise.resolve<null>(null),
    ]);

    const errors: Partial<Record<ModuleKey, string>> = {};

    function applyIfOk<T>(
      key: ModuleKey,
      result: { ok: boolean; data?: T; error?: { message?: string } } | null,
      apply: (value: T) => void,
      fallbackError: string,
    ) {
      if (result?.ok && result.data !== undefined) apply(result.data as T);
      else errors[key] = result?.error?.message || fallbackError;
    }

    applyIfOk("plan", planR, (v) => setData((prev) => ({ ...prev, plan: v.plan, pendingPlan: v.pendingPlan, planExecutionMeta: v.executionMeta })), "计划暂时未能加载，重试后继续");
    applyIfOk("resources", resourcesR, (v) => setData((prev) => ({ ...prev, resources: v.items })), "资源暂时未能加载");
    applyIfOk("memories", memoriesR, (v) => setData((prev) => ({ ...prev, memories: v.items })), "记忆暂时未能加载");
    applyIfOk("candidates", candidatesR, (v) => setData((prev) => ({ ...prev, candidates: v.items })), "建议暂时未能加载");
    applyIfOk("v2Candidates", v2R, (v) => setData((prev) => ({ ...prev, v2Candidates: v.items, v2CandidateTotal: v.total ?? v.items.length })), "建议暂时未能加载");
    applyIfOk("simulations", simulationsR, (v) => setData((prev) => ({ ...prev, simulations: v.items })), "训练暂时未能加载");
    applyIfOk("admin", adminR, (v) => setData((prev) => ({ ...prev, drafts: v.drafts, templates: v.templates })), "草稿暂时未能加载");

    setModuleErrors(errors);
  }, []);

  const loadInitial = useCallback(async () => {
    setInitialLoading(true);
    const seq = ++seqRef.current;
    const meOk = await loadMe();
    if (meOk) {
      await loadModules(modulesForView(activeViewRef.current));
    }
    if (seq === seqRef.current && mountedRef.current) {
      hasDataRef.current = true;
      setInitialLoading(false);
    }
  }, [loadMe, loadModules]);

  const refresh = useCallback(async () => {
    if (!hasDataRef.current) return void loadInitial();
    setRefreshing(true);
    const seq = ++seqRef.current;
    const meOk = await loadMe();
    if (meOk) {
      await loadModules(modulesForView(activeViewRef.current));
    }
    if (seq === seqRef.current && mountedRef.current) setRefreshing(false);
  }, [loadInitial, loadMe, loadModules]);

  const refreshSlices = useCallback(async (keys: ModuleKey[]) => {
    if (!hasDataRef.current) return void loadInitial();
    setRefreshing(true);
    const seq = ++seqRef.current;
    await loadModules(keys);
    if (seq === seqRef.current && mountedRef.current) setRefreshing(false);
  }, [loadInitial, loadModules]);

  const retryFatal = useCallback(async () => {
    if (!hasDataRef.current) await loadInitial();
  }, [loadInitial]);

  const updateAiRuntime = useCallback((meta: AiRuntimeSnapshot) => {
    if (mountedRef.current) setData((prev) => ({ ...prev, aiRuntime: meta }));
  }, []);

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // T20：按页面加载——导航到新视图时，加载该页所需模块（共享摘要已加载的跳过）。跨视图不重载 /api/me。
  const prevModulesRef = useRef<ModuleKey[]>([]);
  useEffect(() => {
    const modules = modulesForView(activeView);
    const prev = prevModulesRef.current;
    const added = modules.filter((m) => !prev.includes(m)) as ModuleKey[];
    prevModulesRef.current = modules;
    if (!hasDataRef.current) return; // 首次加载由 loadInitial 处理
    if (added.length > 0) void refreshSlices(added);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  return {
    state: { data, initialLoading, refreshing, fatal, moduleErrors, notice },
    setNotice,
    updateAiRuntime,
    refresh,
    refreshSlices,
    retryFatal,
  };
}
