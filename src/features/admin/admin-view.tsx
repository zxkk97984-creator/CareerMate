"use client";

/** Admin 工作台 —— 岗位草稿生成/审核、正式岗位库 */
import { useState } from "react";
import { fetchApi } from "@/lib/client-api";

/* ── 局部工具 ── */

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">{title}</h2>{action}</div><div className="p-5">{children}</div></section>;
}

function Btn({ children, onClick, disabled, variant = "primary" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" }) {
  const cls = variant === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : variant === "secondary" ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-slate-950 text-white hover:bg-slate-800";
  return <button disabled={disabled} onClick={onClick} className={`h-10 rounded-md px-4 text-sm font-semibold ${cls}`}>{children}</button>;
}

/* ── 主视图 ── */

interface AdminViewProps { drafts: any[]; templates: any[]; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function AdminView({ drafts, templates, refresh, setNotice }: AdminViewProps) {
  const [roleName, setRoleName] = useState("AI 运营分析助理");
  const [category, setCategory] = useState("AI/运营/数据交叉");
  const [sourceNotes, setSourceNotes] = useState("管理员整理的公开岗位信息\n脱敏岗位访谈记录");

  async function createDraft() { const r = await fetchApi("/api/admin/role-drafts/generate", { method: "POST", body: JSON.stringify({ roleName, category, sourceNotes }) }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿生成失败。"); setNotice("岗位草稿已生成并通过结构校验，等待审核。"); await refresh(); }
  async function review(id: string, action: "approve" | "reject") { const reason = action === "reject" ? window.prompt("请输入拒绝原因")?.trim() : ""; if (action === "reject" && !reason) return; const r = await fetchApi(`/api/admin/role-drafts/${id}/${action}`, { method: "POST", body: action === "reject" ? JSON.stringify({ reason }) : undefined }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿审核失败。"); setNotice(action === "approve" ? "岗位草稿已入库。" : "岗位草稿已拒绝。"); await refresh(); }
  async function editDraft(draft: any) { const content = typeof draft.content === "string" ? JSON.parse(draft.content) : draft.content; const nextName = window.prompt("岗位名称", draft.roleName)?.trim(); const nextCategory = window.prompt("岗位分类", draft.category)?.trim(); const nextSources = window.prompt("来源（每行一条）", (content.sources ?? []).join("\n"))?.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean); if (!nextName || !nextCategory || !nextSources?.length) return; const r = await fetchApi(`/api/admin/role-drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ roleName: nextName, category: nextCategory, content: { ...content, sources: nextSources } }) }); if (!r.ok) return setNotice(r.error?.message ?? "岗位草稿编辑失败。"); setNotice("岗位草稿已编辑并重新校验。"); await refresh(); }

  return (
    <div className="space-y-5">
      <Panel title="岗位草稿审核" action={<Btn onClick={createDraft}>生成草稿</Btn>}>
        <div className="mb-5 grid gap-3 md:grid-cols-3"><input aria-label="岗位名称" className="h-10 rounded-md border border-slate-200 px-3 text-sm" value={roleName} onChange={(e) => setRoleName(e.target.value)} /><input aria-label="岗位分类" className="h-10 rounded-md border border-slate-200 px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} /><textarea aria-label="岗位来源" className="min-h-20 rounded-md border border-slate-200 p-3 text-sm" value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} /></div>
        <div className="space-y-3">{drafts.map((draft) => { const content = typeof draft.content === "string" ? JSON.parse(draft.content) : draft.content; const valid = Array.isArray(content.sources) && content.sources.length > 0 && Array.isArray(content.entryRequirements); return (<div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"><div><div className="font-semibold text-slate-950">{draft.roleName}</div><div className="mt-1 text-sm text-slate-500">{draft.category} · {draft.status}</div><div className={`mt-1 text-xs ${valid ? "text-emerald-700" : "text-rose-700"}`}>结构校验：{valid ? "通过" : "失败"} · 来源：{(content.sources ?? []).join("、") || "缺失"}</div>{draft.reviewNote ? <div className="mt-1 text-xs text-slate-500">审核说明：{draft.reviewNote}</div> : null}</div><div className="flex gap-2"><Btn variant="secondary" disabled={draft.status !== "pending"} onClick={() => editDraft(draft)}>编辑</Btn><Btn disabled={draft.status !== "pending" || !valid} onClick={() => review(draft.id, "approve")}>通过</Btn><Btn variant="secondary" disabled={draft.status !== "pending"} onClick={() => review(draft.id, "reject")}>拒绝</Btn></div></div>); })}</div>
      </Panel>
      <Panel title="正式岗位库">
        <div className="grid gap-3 md:grid-cols-3">{templates.map((t) => (<div key={t.id} className="rounded-md border border-slate-200 p-4"><div className="font-semibold text-slate-950">{t.roleName}</div><div className="mt-1 text-sm text-slate-500">{t.category}</div></div>))}</div>
      </Panel>
    </div>
  );
}
