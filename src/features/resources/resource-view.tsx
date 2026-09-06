"use client";

/** 资源中心 —— 按岗位/能力/类型筛选学习资源（T16a/T16b） */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { filterResources } from "@/lib/resources";
import { buildRoleOptions, roleLabelFor } from "@/lib/role-options";
import { abilityKeys, abilityLabels, resourceTypeLabels, resourceTypes, type ProfileDto, type ResourceItemDto, type ResourceType } from "@/lib/types";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { InlineAlert } from "@/components/ui/inline-alert";

/* ── 主视图 ── */

interface ResourceViewProps { resources: ResourceItemDto[]; profile: ProfileDto; weakAbilities: string[]; }

const selectClass = "cm-select";

interface TaskContext { taskId: string | null; planId: string | null; taskTitle: string | null; roleKey: string | null; }

export function ResourceView({ resources, profile, weakAbilities }: ResourceViewProps) {
  const searchParams = useSearchParams();
  const [roleKey, setRoleKey] = useState(profile.targetRole ?? "");
  const [abilityKey, setAbilityKey] = useState<string>("all");
  const [resourceType, setResourceType] = useState<string>("all");
  const [notice, setNotice] = useState("");
  const [tboxQuery, setTboxQuery] = useState("");
  const [tboxItems, setTboxItems] = useState<Array<{ content: string; source: string; score: number }>>([]);
  const [tboxLoading, setTboxLoading] = useState(false);
  const [tboxSearched, setTboxSearched] = useState(false);
  // 检索失败与零结果分开：null=未失败；"x"=失败文案
  const [tboxError, setTboxError] = useState<string | null>(null);
  // request sequence 防结果竞态：仅接受最新一次查询的返回（T16a）
  const tboxSeq = useRef(0);
  // T16b：任务进入时保留 taskId/planId 上下文，服务端核验归属
  const taskId = searchParams.get("taskId") ?? null;
  const planId = searchParams.get("planId") ?? null;
  const [taskContext, setTaskContext] = useState<TaskContext | null>(null);
  const [taskContextError, setTaskContextError] = useState<string | null>(null);

  // 任务上下文：通过 /api/resources 核验归属并取关联角色；任意 query 参数不可信，以服务端为准（T16b）
  useEffect(() => {
    if (!taskId && !planId) return;
    let active = true;
    void (async () => {
      const params = new URLSearchParams();
      if (taskId) params.set("taskId", taskId);
      if (planId) params.set("planId", planId);
      const r = await fetchApi<{ items?: ResourceItemDto[]; context?: TaskContext }>(`/api/resources?${params.toString()}`);
      if (!active) return;
      if (!r.ok) {
        setTaskContextError(r.error?.message ?? "无法验证该任务上下文，请从任务详情重新进入");
        return;
      }
      if (r.data.context) {
        setTaskContext(r.data.context);
        if (r.data.context.roleKey) setRoleKey(r.data.context.roleKey);
      }
    })();
    return () => { active = false; };
  }, [taskId, planId]);

  // 岗位选项：种子模板 + 当前画像岗位 + 资源中实际出现的有效岗位（T16a，不再只维护三项 roleLabels）
  const resourceRoleKeys = Array.from(new Set(resources.map((r) => r.roleKey).filter((k) => k && k.trim())));
  const roleOptions = buildRoleOptions(profile, resourceRoleKeys);

  const relevant = filterResources(resources, { roleKey, abilityKey, type: resourceType });

  async function searchTbox(queryOverride?: string) {
    const query = (queryOverride ?? tboxQuery).trim();
    if (!query) return;
    const seq = ++tboxSeq.current;
    setTboxLoading(true);
    setTboxError(null);
    setNotice("");
    const r = await fetchApi<{ items?: Array<{ content: string; source: string; score: number }> }>("/api/tbox/retrieve", {
      method: "POST",
      body: JSON.stringify({ datasetKey: "learningResources", query, limit: 10 }),
    });
    // 已有更新的查询发起，本次结果过期，丢弃
    if (seq !== tboxSeq.current) return;
    setTboxSearched(true);
    setTboxLoading(false);
    if (r.ok) {
      setTboxItems(r.data.items ?? []);
      setTboxError(null);
    } else {
      setTboxItems([]);
      setTboxError(r.error?.message ?? "百宝箱检索失败，请稍后重试");
    }
  }

  function buildRecommendQuery() {
    const parts = [roleLabelFor(roleKey, profile), abilityKey !== "all" ? (abilityLabels[abilityKey as keyof typeof abilityLabels] ?? "") : ""];
    const query = parts.filter(Boolean).join(" ");
    setTboxQuery(query);
    if (query) void searchTbox(query);
  }

  return (
    <div data-od-id="resources-layout">
    <SurfaceCard title="资源中心" description="按目标岗位、能力方向与资源类型筛选">
      {/* T16b：由任务进入时显示上下文 + 返回任务 */}
      {(taskId || planId) ? (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: "var(--cm-radius-control)", background: "var(--cm-canvas)", border: "1px solid var(--cm-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13.5, color: "var(--cm-text-strong)", display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden="true">🔎</span>
            {taskContextError
              ? <span style={{ color: "var(--cm-warning)" }}>{taskContextError}</span>
              : taskContext?.taskTitle
                ? <>为当前任务查找资源：<strong>{taskContext.taskTitle}</strong></>
                : <>为当前任务查找资源</>}
          </div>
          <Link href="/path" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px", borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", color: "var(--cm-text-strong)", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
            <ArrowLeft size={14} /> 返回任务
          </Link>
        </div>
      ) : null}

      {/* 顶部三个筛选器 */}
      <div style={{ display: "grid", gap: 14 }} className="admin-form-grid">
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, fontWeight: 500, color: "var(--cm-text-muted)" }}>
          目标岗位
          <select className={selectClass} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
            <option value="">全部岗位</option>
            {roleOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, fontWeight: 500, color: "var(--cm-text-muted)" }}>
          能力方向
          <select className={selectClass} value={abilityKey} onChange={(e) => setAbilityKey(e.target.value)}>
            <option value="all">全部能力</option>
            {abilityKeys.map((a) => <option key={a} value={a}>{abilityLabels[a]}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, fontWeight: 500, color: "var(--cm-text-muted)" }}>
          资源类型
          <select className={selectClass} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
            <option value="all">全部类型</option>
            {resourceTypes.map((t) => <option key={t} value={t}>{resourceTypeLabels[t]}</option>)}
          </select>
        </label>
      </div>

      {/* 百宝箱检索 */}
      <div style={{ margin: "18px 0 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="cm-input"
          style={{ flex: 1, minWidth: 220 }}
          value={tboxQuery}
          onChange={(e) => setTboxQuery(e.target.value)}
          placeholder="搜索学习资源"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchTbox(); } }}
        />
        <button
          className="suggested-btn welcome-primary"
          style={{ minHeight: 40, width: "auto", padding: "0 16px", animation: "none" }}
          onClick={() => void searchTbox()}
          disabled={tboxLoading || !tboxQuery.trim()}
        >
          <Search size={14} />
          {tboxLoading ? "检索中..." : "搜索学习资源"}
        </button>
        <button
          className="suggested-btn"
          style={{ minHeight: 40, width: "auto", padding: "0 16px", animation: "none" }}
          onClick={() => buildRecommendQuery()}
          disabled={tboxLoading}
        >
          按当前筛选推荐
        </button>
      </div>

      {tboxSearched ? (
        <div style={{ margin: "16px 0 0" }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>百宝箱检索结果</h4>
          {tboxError ? (
            // 检索失败（网络/业务/超时）：与“零结果”分开的信息
            <InlineAlert tone="error">{tboxError}</InlineAlert>
          ) : tboxItems.length === 0 ? (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--cm-text-muted)" }}>未找到相关学习资源。</p>
          ) : (
            <div className="resource-grid" style={{ marginTop: 10 }}>
              {tboxItems.map((item, i) => (
                <article key={`${item.source}-${i}`} className="resource-card">
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-strong)" }}>{item.content}</div>
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--cm-text-subtle)" }}>
                    <span>{item.source}</span>
                    <span>相关度 {Math.round(item.score * 100)}%</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* 优先补弱：主色标签 */}
      {weakAbilities.length ? (
        <div style={{ margin: "18px 0 20px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--cm-text-muted)" }}>优先补弱：</span>
          {weakAbilities.map((a) => (
            <button
              key={a}
              className={`weak-chip ${abilityKey === a ? "active" : ""}`}
              onClick={() => setAbilityKey(a)}
              aria-pressed={abilityKey === a}
            >
              {abilityLabels[a as keyof typeof abilityLabels]}
            </button>
          ))}
        </div>
      ) : null}

      {notice ? <InlineAlert tone="info">{notice}</InlineAlert> : null}

      {relevant.length === 0 ? (
        <div style={{ borderRadius: "var(--cm-radius-control)", background: "var(--cm-canvas)", padding: 24, fontSize: 13.5, color: "var(--cm-text-muted)", textAlign: "center" }}>
          没有符合当前筛选条件的资源，换个条件试试。
        </div>
      ) : (
        <div className="resource-grid">
          {relevant.map((item, i) => (
            // 有 URL 才是可跳转的语义链接；无 URL 不伪装成可点击卡片（T16a）
            item.url ? (
              <a
                key={item.id}
                className="resource-card resource-card-clickable"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ animationDelay: `${Math.min(i, 4) * 0.06}s`, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: "var(--cm-text-strong)" }}>{item.title}</h3>
                  <span className="resource-type">{resourceTypeLabels[item.type as ResourceType] ?? item.type}</span>
                </div>
                <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)" }}>{item.description}</p>
                <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--cm-text-subtle)", gap: 8 }}>
                  <span>来源：{item.source}</span>
                  {item.estimatedHours != null ? <span>约 {item.estimatedHours} 小时</span> : null}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--cm-brand-ink)", fontWeight: 500 }}>
                    <ExternalLink size={12} />
                    查看资源
                  </span>
                </div>
              </a>
            ) : (
              <article
                key={item.id}
                className="resource-card"
                style={{ animationDelay: `${Math.min(i, 4) * 0.06}s` }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: "var(--cm-text-strong)" }}>{item.title}</h3>
                  <span className="resource-type">{resourceTypeLabels[item.type as ResourceType] ?? item.type}</span>
                </div>
                <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)" }}>{item.description}</p>
                <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--cm-text-subtle)", gap: 8 }}>
                  <span>来源：{item.source}</span>
                  {item.estimatedHours != null ? <span>约 {item.estimatedHours} 小时</span> : null}
                  <span style={{ color: "var(--cm-text-subtle)" }}>查看实践说明</span>
                </div>
              </article>
            )
          ))}
        </div>
      )}
    </SurfaceCard>
    </div>
  );
}
