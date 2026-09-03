"use client";

/** 资源中心 —— 按岗位/能力/类型筛选学习资源 */
import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { filterResources } from "@/lib/resources";
import { abilityKeys, abilityLabels, resourceTypeLabels, resourceTypes, seedRoleKeys, type ProfileDto, type ResourceItemDto, type ResourceType } from "@/lib/types";
import { SurfaceCard } from "@/components/ui/surface-card";
import { InlineAlert } from "@/components/ui/inline-alert";

/* ── 主视图 ── */

interface ResourceViewProps { resources: ResourceItemDto[]; profile: ProfileDto; weakAbilities: string[]; }

const roleLabels: Record<string, string> = { ai_product_manager: "AI 产品经理", data_analyst: "数据分析师", aigc_operator: "AIGC 运营" };

const selectClass = "cm-select";

export function ResourceView({ resources, profile, weakAbilities }: ResourceViewProps) {
  const [roleKey, setRoleKey] = useState(profile.targetRole ?? "");
  const [abilityKey, setAbilityKey] = useState<string>("all");
  const [resourceType, setResourceType] = useState<string>("all");
  const [notice, setNotice] = useState("");
  const [tboxQuery, setTboxQuery] = useState("");
  const [tboxItems, setTboxItems] = useState<Array<{ content: string; source: string; score: number }>>([]);
  const [tboxLoading, setTboxLoading] = useState(false);
  const [tboxSearched, setTboxSearched] = useState(false);
  const relevant = filterResources(resources, { roleKey, abilityKey, type: resourceType });

  async function searchTbox(queryOverride?: string) {
    const query = (queryOverride ?? tboxQuery).trim();
    if (!query) return;
    setTboxLoading(true);
    setNotice("");
    try {
      const res = await fetch("/api/tbox/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetKey: "learningResources", query, limit: 10 }),
      });
      const body = await res.json();
      if (body.ok) {
        setTboxItems(body.data.items ?? []);
      } else {
        setTboxItems([]);
        setNotice(body.error?.message ?? "百宝箱检索失败，请稍后重试");
      }
      setTboxSearched(true);
    } catch {
      setTboxItems([]);
      setNotice("百宝箱检索失败，请稍后重试");
      setTboxSearched(true);
    } finally {
      setTboxLoading(false);
    }
  }

  function buildRecommendQuery() {
    const parts = [roleLabels[roleKey] ?? "", abilityKey !== "all" ? (abilityLabels[abilityKey as keyof typeof abilityLabels] ?? "") : ""];
    const query = parts.filter(Boolean).join(" ");
    setTboxQuery(query);
    if (query) void searchTbox(query);
  }

  function openResource(item: ResourceItemDto) {
    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
      return;
    }
    setNotice(`「${item.title}」暂未提供在线链接，可参考来源信息自行查找。`);
  }

  return (
    <div data-od-id="resources-layout">
    <SurfaceCard title="资源中心" description="按目标岗位、能力方向与资源类型筛选">
      {/* 顶部三个筛选器 */}
      <div style={{ display: "grid", gap: 14 }} className="admin-form-grid">
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, fontWeight: 500, color: "var(--cm-text-muted)" }}>
          目标岗位
          <select className={selectClass} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
            {seedRoleKeys.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
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
          placeholder="输入关键词搜索百宝箱学习资源"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchTbox(); } }}
        />
        <button
          className="suggested-btn welcome-primary"
          style={{ minHeight: 40, width: "auto", padding: "0 16px", animation: "none" }}
          onClick={() => void searchTbox()}
          disabled={tboxLoading || !tboxQuery.trim()}
        >
          <Search size={14} />
          {tboxLoading ? "检索中..." : "搜索百宝箱"}
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
          {tboxItems.length === 0 ? (
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
            <article
              key={item.id}
              className={`resource-card ${item.url ? "resource-card-clickable" : ""}`}
              style={{ animationDelay: `${Math.min(i, 4) * 0.06}s` }}
              onClick={() => openResource(item)}
              role={item.url ? "link" : undefined}
              tabIndex={item.url ? 0 : undefined}
              onKeyDown={item.url ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.open(item.url!, "_blank", "noopener,noreferrer"); } } : undefined}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: "var(--cm-text-strong)" }}>{item.title}</h3>
                <span className="resource-type">{resourceTypeLabels[item.type as ResourceType] ?? item.type}</span>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)" }}>{item.description}</p>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--cm-text-subtle)" }}>
                <span>来源：{item.source}</span>
                {item.url ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--cm-brand-ink)", fontWeight: 500 }}>
                    <ExternalLink size={12} />
                    查看资源
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </SurfaceCard>
    </div>
  );
}
