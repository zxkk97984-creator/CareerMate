"use client";

/** Admin 工作台 —— 岗位草稿生成/审核、正式岗位库 */
import { useState } from "react";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

/* ── 主视图 ── */

interface AdminViewProps { drafts: any[]; templates: any[]; refresh: () => Promise<void>; setNotice: (v: string) => void; }

const inputStyle: React.CSSProperties = { height: 40, borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)", outline: "none" };

export function AdminView({ drafts, templates, refresh, setNotice }: AdminViewProps) {
  const [roleName, setRoleName] = useState("AI 运营分析助理");
  const [category, setCategory] = useState("AI/运营/数据交叉");
  const [sourceNotes, setSourceNotes] = useState("管理员整理的公开岗位信息\n脱敏岗位访谈记录");

  async function createDraft() { const r = await fetchApi("/api/admin/role-drafts/generate", { method: "POST", body: JSON.stringify({ roleName, category, sourceNotes }) }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿生成失败。"); setNotice("岗位草稿已生成并通过结构校验，等待审核。"); await refresh(); }
  async function review(id: string, action: "approve" | "reject") { const reason = action === "reject" ? window.prompt("请输入拒绝原因")?.trim() : ""; if (action === "reject" && !reason) return; const r = await fetchApi(`/api/admin/role-drafts/${id}/${action}`, { method: "POST", body: action === "reject" ? JSON.stringify({ reason }) : undefined }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿审核失败。"); setNotice(action === "approve" ? "岗位草稿已入库。" : "岗位草稿已拒绝。"); await refresh(); }
  async function editDraft(draft: any) { const c = typeof draft.content === "string" ? JSON.parse(draft.content) : draft.content; const nextName = window.prompt("岗位名称", draft.roleName)?.trim(); const nextCategory = window.prompt("岗位分类", draft.category)?.trim(); const nextSources = window.prompt("来源（每行一条）", (c.sources ?? []).join("\n"))?.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean); if (!nextName || !nextCategory || !nextSources?.length) return; const r = await fetchApi(`/api/admin/role-drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ roleName: nextName, category: nextCategory, content: { ...c, sources: nextSources } }) }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿编辑失败。"); setNotice("岗位草稿已编辑并重新校验。"); await refresh(); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SurfaceCard title="岗位草稿审核" action={<Button onClick={createDraft}>生成草稿</Button>}>
        <div style={{ marginBottom: 20, display: "grid", gap: 12, gridTemplateColumns: "repeat(3,1fr)" }} className="max-md:grid-cols-1">
          <input aria-label="岗位名称" style={inputStyle} value={roleName} onChange={(e) => setRoleName(e.target.value)} />
          <input aria-label="岗位分类" style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} />
          <textarea aria-label="岗位来源" style={{ ...inputStyle, minHeight: 72, height: "auto", padding: "8px 12px", resize: "vertical" }} value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drafts.map((draft) => {
            const c = typeof draft.content === "string" ? JSON.parse(draft.content) : draft.content;
            const valid = Array.isArray(c.sources) && c.sources.length > 0 && Array.isArray(c.entryRequirements);
            return (
              <div key={draft.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--cm-text-strong)" }}>{draft.roleName}</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: "var(--cm-text-muted)" }}>{draft.category} · <StatusBadge tone={draft.status === "pending" ? "warning" : draft.status === "approved" ? "success" : "neutral"}>{draft.status}</StatusBadge></div>
                  <div style={{ marginTop: 4, fontSize: 12, color: valid ? "var(--cm-success)" : "var(--cm-danger)" }}>结构校验：{valid ? "通过" : "失败"} · 来源：{(c.sources ?? []).join("、") || "缺失"}</div>
                  {draft.reviewNote ? <div style={{ marginTop: 4, fontSize: 12, color: "var(--cm-text-subtle)" }}>审核说明：{draft.reviewNote}</div> : null}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="secondary" disabled={draft.status !== "pending"} onClick={() => editDraft(draft)}>编辑</Button>
                  <Button disabled={draft.status !== "pending" || !valid} onClick={() => review(draft.id, "approve")}>通过</Button>
                  <Button variant="secondary" disabled={draft.status !== "pending"} onClick={() => review(draft.id, "reject")}>拒绝</Button>
                </div>
              </div>
            );
          })}
        </div>
      </SurfaceCard>
      <SurfaceCard title="正式岗位库">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3,1fr)" }} className="max-md:grid-cols-1">
          {templates.map((t) => (
            <div key={t.id} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 16 }}>
              <div style={{ fontWeight: 600, color: "var(--cm-text-strong)" }}>{t.roleName}</div>
              <div style={{ marginTop: 4, fontSize: 14, color: "var(--cm-text-muted)" }}>{t.category}</div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
