"use client";

/** 资源中心 —— 按岗位/能力/类型筛选学习资源 */
import { useState } from "react";
import { filterResources } from "@/lib/resources";
import { abilityKeys, abilityLabels, resourceTypes, supportedRoleKeys, type ProfileDto, type ResourceItemDto } from "@/lib/types";
import { SurfaceCard } from "@/components/ui/surface-card";

/* ── 主视图 ── */

interface ResourceViewProps { resources: ResourceItemDto[]; profile: ProfileDto; weakAbilities: string[]; }

const roleLabels: Record<string, string> = { ai_product_manager: "AI 产品经理", data_analyst: "数据分析师", aigc_operator: "AIGC 运营" };

const selectStyle: React.CSSProperties = { display: "block", marginTop: 4, height: 40, width: "100%", borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)" };

export function ResourceView({ resources, profile, weakAbilities }: ResourceViewProps) {
  const [roleKey, setRoleKey] = useState(profile.targetRole);
  const [abilityKey, setAbilityKey] = useState<string>("all");
  const [resourceType, setResourceType] = useState<string>("all");
  const relevant = filterResources(resources, { roleKey, abilityKey, type: resourceType });

  return (
    <SurfaceCard title="资源中心">
      <div style={{ marginBottom: 20, display: "grid", gap: 12, gridTemplateColumns: "repeat(3,1fr)" }} className="max-md:grid-cols-1">
        <label style={{ fontSize: 14, color: "var(--cm-text-muted)" }}>目标岗位<select style={selectStyle} value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>{supportedRoleKeys.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}</select></label>
        <label style={{ fontSize: 14, color: "var(--cm-text-muted)" }}>能力方向<select style={selectStyle} value={abilityKey} onChange={(e) => setAbilityKey(e.target.value)}><option value="all">全部能力</option>{abilityKeys.map((a) => <option key={a} value={a}>{abilityLabels[a]}</option>)}</select></label>
        <label style={{ fontSize: 14, color: "var(--cm-text-muted)" }}>资源类型<select style={selectStyle} value={resourceType} onChange={(e) => setResourceType(e.target.value)}><option value="all">全部类型</option>{resourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      </div>
      {weakAbilities.length ? (
        <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14, color: "var(--cm-text-muted)" }}>
          <span>优先补弱：</span>
          {weakAbilities.map((a) => (
            <button key={a} onClick={() => setAbilityKey(a)} style={{ borderRadius: 999, padding: "4px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, ...(abilityKey === a ? { background: "var(--cm-warning)", color: "#fff" } : { background: "var(--cm-warning-bg)", color: "var(--cm-warning)" }) }}>{abilityLabels[a as keyof typeof abilityLabels]}</button>
          ))}
        </div>
      ) : null}
      {relevant.length === 0 ? (
        <div style={{ borderRadius: "var(--cm-radius-sm)", background: "var(--cm-canvas)", padding: 20, fontSize: 14, color: "var(--cm-text-muted)" }}>没有符合当前筛选条件的资源。</div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2,1fr)" }} className="max-md:grid-cols-1">
          {relevant.map((item) => (
            <div key={item.id} style={{ borderRadius: "var(--cm-radius-card)", border: "1px solid var(--cm-border)", padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}><div style={{ fontWeight: 600, color: "var(--cm-text-strong)" }}>{item.title}</div><span style={{ borderRadius: 999, background: "var(--cm-canvas)", padding: "4px 12px", fontSize: 12, color: "var(--cm-text-muted)" }}>{item.type}</span></div>
              <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>{item.description}</p>
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--cm-text-subtle)" }}>来源：{item.source}</div>
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
  );
}
