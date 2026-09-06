import type { ModuleKey } from "@/hooks/use-workspace-data";
import type { View } from "@/lib/workspace-types";

/**
 * T20：按页面加载——每页只请求所需业务模块 + 必要共享摘要。
 * 共享摘要（任何视图都需要的侧栏待确认计数）恒常加载：plan（含 pendingPlan）、candidates、v2Candidates。
 * 其余按视图追加，避免“打开资源页还去请求管理员/训练/全部记忆”。
 */
export const SHARED_MODULES: ModuleKey[] = ["plan", "candidates", "v2Candidates"];

const VIEW_PAGE_MODULES: Partial<Record<View, ModuleKey[]>> = {
  dashboard: [],
  path: [],
  simulation: ["simulations"],
  resources: ["resources"],
  memory: ["memories"],
  admin: ["admin"],
  onboarding: [],
};

/** 计算某一视图需要加载的模块（共享摘要 + 该页专属），去重并保持稳定顺序。 */
export function modulesForView(view: View): ModuleKey[] {
  const page = VIEW_PAGE_MODULES[view] ?? [];
  return Array.from(new Set([...SHARED_MODULES, ...page]));
}
