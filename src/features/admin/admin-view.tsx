"use client";

/** Admin 工作台 —— 创建人工模板草稿、待审核草稿列表、正式岗位库表格 */
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
    <div className="admin-stack" data-od-id="admin-layout">
      {/* ── 顶部：创建人工模板草稿 ─────────────────── */}
      <SurfaceCard title="创建人工模板草稿" description="填写岗位信息，生成带来源与任职要求的草稿">
        <div className="admin-form-grid">
          <input aria-label="岗位名称" className="cm-input" placeholder="岗位名称" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
          <input aria-label="岗位分类" className="cm-input" placeholder="岗位分类" value={category} onChange={(e) => setCategory(e.target.value)} />
          <textarea aria-label="岗位来源" className="cm-input-textarea" style={{ minHeight: 72 }} placeholder="来源说明（每行一条）" value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} />
        </div>
        <div style={{ marginTop: 16 }}>
          <Button onClick={createDraft}>创建并生成草稿</Button>
        </div>
      </SurfaceCard>

      {/* ── 中部：待审核草稿列表 ───────────────────── */}
      <SurfaceCard title="岗位草稿审核" description={drafts.length ? `共 ${drafts.length} 条草稿` : "暂无草稿"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {drafts.length === 0 && (
            <p style={{ margin: 0, padding: "10px 2px", fontSize: 13.5, color: "var(--cm-text-muted)" }}>还没有草稿，先用上方表单创建一条。</p>
          )}
          {drafts.map((draft, index) => {
            const c = safeParseDraftContent(draft.content);
            const valid = Array.isArray(c.sources) && c.sources.length > 0 && Array.isArray(c.entryRequirements);
            const isEditing = editingDraft?.id === draft.id;
            const isRejecting = rejectTarget === draft.id;

            return (
              <div key={draft.id} data-testid="draft-card" className="draft-card" style={{ animationDelay: `${Math.min(index, 4) * 0.05}s` }}>
                {isEditing ? (
                  /* 内联编辑表单 */
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "grid", gap: 12 }} className="admin-form-grid">
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-text-muted)" }}>
                        岗位名称
                        <input aria-label="编辑岗位名称" className="cm-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-text-muted)" }}>
                        岗位分类
                        <input aria-label="编辑岗位分类" className="cm-input" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--cm-text-muted)" }}>
                        来源（每行一条）
                        <textarea aria-label="编辑来源" className="cm-input-textarea" style={{ minHeight: 72 }} value={editSources} onChange={(e) => setEditSources(e.target.value)} />
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button onClick={saveEditDraft}>保存</Button>
                      <Button variant="secondary" onClick={cancelEditDraft}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--cm-text-strong)" }}>{draft.roleName}</span>
                        <StatusBadge tone={draft.status === "pending" ? "warning" : draft.status === "approved" ? "success" : "neutral"}>
                          {draft.status === "pending" ? "待审核" : draft.status === "approved" ? "已通过" : draft.status === "rejected" ? "已拒绝" : draft.status}
                        </StatusBadge>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13.5, color: "var(--cm-text-muted)" }}>{draft.category}</div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: valid ? "var(--cm-success)" : "var(--cm-danger)" }}>
                        结构校验：{valid ? "通过" : "失败"} · 来源：{(c.sources ?? []).join("、") || "缺失"}
                      </div>
                      {draft.reviewNote ? <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--cm-text-subtle)" }}>审核说明：{draft.reviewNote}</div> : null}

                      {/* 拒绝原因内联输入 */}
                      {isRejecting && (
                        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            aria-label="拒绝原因"
                            className="cm-input"
                            style={{ flex: 1, minWidth: 200 }}
                            placeholder="请输入拒绝原因"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                          />
                          <Button variant="danger" disabled={!rejectReason.trim()} onClick={submitReject}>确认拒绝</Button>
                          <Button variant="secondary" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>取消</Button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="ghost" disabled={draft.status !== "pending"} onClick={() => startEdit(draft)}>编辑</Button>
                      <Button variant="secondary" disabled={draft.status !== "pending" || !valid} onClick={() => review(draft.id, "approve")}>通过</Button>
                      <Button variant="ghost" disabled={draft.status !== "pending" || isRejecting} onClick={() => review(draft.id, "reject")}>拒绝</Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </SurfaceCard>

      {/* ── 底部：正式岗位库（简洁表格） ───────────── */}
      <SurfaceCard title="正式岗位库" description={templates.length ? `已收录 ${templates.length} 个岗位模板` : "暂无正式岗位"}>
        {templates.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--cm-text-muted)" }}>审核通过的草稿会自动进入岗位库。</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="cm-table">
              <thead>
                <tr>
                  <th>岗位名称</th>
                  <th>分类</th>
                  <th>来源数</th>
                  <th>任职要求</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const c = safeParseDraftContent(t.content);
                  const sourceCount = Array.isArray(c.sources) ? c.sources.length : 0;
                  const requirementCount = Array.isArray(c.entryRequirements) ? c.entryRequirements.length : 0;
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.roleName}</td>
                      <td className="cm-table-muted">{t.category}</td>
                      <td className="cm-table-subtle">{sourceCount || "-"}</td>
                      <td className="cm-table-subtle">{requirementCount > 0 ? requirementCount + " 项" : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
