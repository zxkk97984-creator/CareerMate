"use client";

/** Admin 工作台 —— 岗位草稿生成/审核、正式岗位库 */
import { useState } from "react";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

/* ── 工具函数 ── */

/** 安全解析草稿内容，异常数据返回空对象防止页面崩溃 */
function safeParseDraftContent(content: unknown): { sources?: string[]; entryRequirements?: unknown[]; [k: string]: unknown } {
  if (typeof content !== "string") return (content as Record<string, unknown>) ?? {};
  try { return JSON.parse(content); }
  catch { return {}; }
}

/* ── 主视图 ── */

interface AdminViewProps { drafts: any[]; templates: any[]; refresh: () => Promise<void>; setNotice: (v: string) => void; }

const inputStyle: React.CSSProperties = { height: 40, borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)", outline: "none" };

export function AdminView({ drafts, templates, refresh, setNotice }: AdminViewProps) {
  const [roleName, setRoleName] = useState("AI 运营分析助理");
  const [category, setCategory] = useState("AI/运营/数据交叉");
  const [sourceNotes, setSourceNotes] = useState("管理员整理的公开岗位信息\n脱敏岗位访谈记录");

  // 拒绝：内联输入原因
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // 编辑草稿：内联表单
  const [editingDraft, setEditingDraft] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSources, setEditSources] = useState("");

  async function createDraft() { const r = await fetchApi("/api/admin/role-drafts/generate", { method: "POST", body: JSON.stringify({ roleName, category, sourceNotes }) }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿生成失败。"); setNotice("岗位草稿已生成并通过结构校验，等待审核。"); await refresh(); }

  /** 审核操作 */
  async function review(id: string, action: "approve" | "reject") {
    if (action === "reject") {
      // 打开内联拒绝输入
      setRejectTarget(id);
      setRejectReason("");
      return;
    }
    // 通过
    const r = await fetchApi(`/api/admin/role-drafts/${id}/approve`, { method: "POST" });
    if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿审核失败。");
    setNotice("岗位草稿已入库。");
    await refresh();
  }

  /** 提交拒绝 */
  async function submitReject() {
    const id = rejectTarget;
    if (!id || !rejectReason.trim()) return;
    const r = await fetchApi(`/api/admin/role-drafts/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason.trim() }) });
    if (!r.ok) { setNotice(r.error?.message ?? "岗位草稿审核失败。"); return; }
    setRejectTarget(null);
    setRejectReason("");
    setNotice("岗位草稿已拒绝。");
    await refresh();
  }

  /** 开始编辑草稿 */
  function startEdit(draft: any) {
    const c = safeParseDraftContent(draft.content);
    setEditingDraft(draft);
    setEditName(draft.roleName);
    setEditCategory(draft.category);
    setEditSources((c.sources ?? []).join("\n"));
  }

  /** 取消编辑 */
  function cancelEditDraft() {
    setEditingDraft(null);
    setEditName("");
    setEditCategory("");
    setEditSources("");
  }

  /** 保存编辑 */
  async function saveEditDraft() {
    const draft = editingDraft;
    if (!draft) return;
    const nextName = editName.trim();
    const nextCategory = editCategory.trim();
    const nextSources = editSources.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
    if (!nextName || !nextCategory || !nextSources.length) return;
    const c = safeParseDraftContent(draft.content);
    const r = await fetchApi(`/api/admin/role-drafts/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify({ roleName: nextName, category: nextCategory, content: { ...c, sources: nextSources } }),
    });
    if (!r.ok) { setNotice(r.error?.message ?? "岗位草稿编辑失败。"); return; }
    cancelEditDraft();
    setNotice("岗位草稿已编辑并重新校验。");
    await refresh();
  }

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
            const c = safeParseDraftContent(draft.content);
            const valid = Array.isArray(c.sources) && c.sources.length > 0 && Array.isArray(c.entryRequirements);
            const isEditing = editingDraft?.id === draft.id;
            const isRejecting = rejectTarget === draft.id;

            return (
              <div key={draft.id} data-testid="draft-card" className="rounded-md border" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 16 }}>
                {isEditing ? (
                  /* 内联编辑表单 */
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--cm-text-muted)" }}>
                        岗位名称
                        <input aria-label="编辑岗位名称" style={inputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--cm-text-muted)" }}>
                        岗位分类
                        <input aria-label="编辑岗位分类" style={inputStyle} value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                      </label>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--cm-text-muted)" }}>
                      来源（每行一条）
                      <textarea aria-label="编辑来源" style={{ ...inputStyle, minHeight: 72, height: "auto", padding: "8px 12px", resize: "vertical" }} value={editSources} onChange={(e) => setEditSources(e.target.value)} />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button onClick={saveEditDraft}>保存</Button>
                      <Button variant="secondary" onClick={cancelEditDraft}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "var(--cm-text-strong)" }}>{draft.roleName}</div>
                      <div style={{ marginTop: 4, fontSize: 14, color: "var(--cm-text-muted)" }}>{draft.category} · <StatusBadge tone={draft.status === "pending" ? "warning" : draft.status === "approved" ? "success" : "neutral"}>{draft.status}</StatusBadge></div>
                      <div style={{ marginTop: 4, fontSize: 12, color: valid ? "var(--cm-success)" : "var(--cm-danger)" }}>结构校验：{valid ? "通过" : "失败"} · 来源：{(c.sources ?? []).join("、") || "缺失"}</div>
                      {draft.reviewNote ? <div style={{ marginTop: 4, fontSize: 12, color: "var(--cm-text-subtle)" }}>审核说明：{draft.reviewNote}</div> : null}

                      {/* 拒绝原因内联输入 */}
                      {isRejecting && (
                        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            aria-label="拒绝原因"
                            placeholder="请输入拒绝原因"
                            style={{ ...inputStyle, flex: 1 }}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                          />
                          <Button variant="danger" disabled={!rejectReason.trim()} onClick={submitReject}>确认拒绝</Button>
                          <Button variant="secondary" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>取消</Button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="secondary" disabled={draft.status !== "pending"} onClick={() => startEdit(draft)}>编辑</Button>
                      <Button disabled={draft.status !== "pending" || !valid} onClick={() => review(draft.id, "approve")}>通过</Button>
                      <Button variant="secondary" disabled={draft.status !== "pending" || isRejecting} onClick={() => review(draft.id, "reject")}>拒绝</Button>
                    </div>
                  </>
                )}
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
