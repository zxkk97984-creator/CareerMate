"use client";

/** 记忆权限 —— 长期记忆管理、隐私数据、画像候选确认/拒绝 */
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

interface MemoryViewProps { memories: any[]; candidates: any[]; memoryEnabled: boolean; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function MemoryView({ memories, candidates, memoryEnabled, refresh, setNotice }: MemoryViewProps) {
  const [content, setContent] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");

  async function operate(candidateId: string, action: "accept" | "reject") { await fetchApi("/api/profile/candidates", { method: "PATCH", body: JSON.stringify({ candidateId, action }) }); setNotice(action === "accept" ? "画像更新已确认。" : "画像更新已拒绝。"); await refresh(); }
  async function deleteMemory(id: string) { await fetchApi(`/api/memory/${id}`, { method: "DELETE" }); setNotice("记忆已删除。"); await refresh(); }
  async function createMemory() { const r = await fetchApi<{ memory: any }>("/api/memories", { method: "POST", body: JSON.stringify({ content, sensitivity: "normal" }) }); if (!r.ok) return setNotice(r.error?.message ?? "记忆创建失败。"); setContent(""); setNotice("记忆已创建。"); await refresh(); }
  async function editMemory(memory: any) { const next = window.prompt("编辑记忆", memory.content)?.trim(); if (!next || next === memory.content) return; const r = await fetchApi(`/api/memory/${memory.id}`, { method: "PATCH", body: JSON.stringify({ content: next }) }); if (!r.ok) return setNotice(r.error?.message ?? "记忆编辑失败。"); setNotice("记忆已更新。"); await refresh(); }
  async function toggleMemory() { const r = await fetchApi<{ enabled: boolean }>("/api/memory/toggle", { method: "POST", body: JSON.stringify({ enabled: !memoryEnabled }) }); if (!r.ok) return setNotice(r.error?.message ?? "记忆开关保存失败。"); setNotice(r.data.enabled ? "长期记忆已开启。" : "长期记忆已关闭，已有记忆仍被保留。"); await refresh(); }
  async function exportData() { const r = await fetchApi<Record<string, unknown>>("/api/privacy/export"); if (!r.ok) return setNotice(r.error?.message ?? "数据导出失败。"); const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "careermate-data.json"; a.click(); URL.revokeObjectURL(url); setNotice("账号成长数据已导出，敏感凭据未包含在文件中。"); }
  async function clearData() { const r = await fetchApi<{ cleared: boolean }>("/api/privacy/account-data", { method: "DELETE", body: JSON.stringify({ confirmation: clearConfirmation }) }); if (!r.ok) return setNotice(r.error?.message ?? "成长数据清空失败。"); setClearConfirmation(""); setNotice("成长数据已清空，账号仍然保留，请重新完成画像引导。"); await refresh(); }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="长期记忆" action={<Btn variant="secondary" onClick={toggleMemory}>{memoryEnabled ? "关闭长期记忆" : "开启长期记忆"}</Btn>}>
        <div className="mb-4 flex gap-2"><input aria-label="新记忆" disabled={!memoryEnabled} className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm" placeholder={memoryEnabled ? "添加一条长期记忆" : "长期记忆已关闭"} value={content} onChange={(e) => setContent(e.target.value)} /><Btn disabled={!memoryEnabled || !content.trim()} onClick={createMemory}>创建</Btn></div>
        <div className="space-y-3">{memories.map((m) => (<div key={m.id} className="rounded-md border border-slate-200 p-4"><p className="text-sm leading-6 text-slate-700">{m.content}</p><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{m.sensitivity}</span><div className="flex gap-2"><Btn variant="secondary" onClick={() => editMemory(m)}>编辑</Btn><Btn variant="danger" onClick={() => deleteMemory(m.id)}>删除</Btn></div></div></div>))}</div>
      </Panel>
      <Panel title="隐私与数据">
        <div className="space-y-3"><Btn variant="secondary" onClick={exportData}>导出 JSON</Btn><p className="text-sm text-slate-600">清空会删除画像成长数据并重新进入引导，但保留账号、角色和当前登录态。请输入确认词 <code>CLEAR_MY_DATA</code>。</p><input aria-label="清空确认词" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={clearConfirmation} onChange={(e) => setClearConfirmation(e.target.value)} /><Btn variant="danger" disabled={clearConfirmation !== "CLEAR_MY_DATA"} onClick={clearData}>清空成长数据</Btn></div>
      </Panel>
      <Panel title="画像更新候选">
        <div className="space-y-3">{candidates.map((c) => (<div key={c.id} className="rounded-md border border-slate-200 p-4"><div className="text-sm font-semibold text-slate-900">{c.field}</div><p className="mt-2 text-sm leading-6 text-slate-600">{c.reason}</p><div className="mt-3 flex gap-2"><Btn disabled={c.status !== "pending"} onClick={() => operate(c.id, "accept")}>确认</Btn><Btn variant="secondary" disabled={c.status !== "pending"} onClick={() => operate(c.id, "reject")}>拒绝</Btn></div></div>))}</div>
      </Panel>
    </div>
  );
}
