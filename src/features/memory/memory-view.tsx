"use client";

/** 记忆权限 —— 长期记忆管理、隐私数据、画像候选确认/拒绝 */
import { useState } from "react";
import { fetchApi } from "@/lib/client-api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";

/* ── 主视图 ── */

interface MemoryViewProps { memories: any[]; candidates: any[]; memoryEnabled: boolean; refresh: () => Promise<void>; setNotice: (v: string) => void; }

const inputStyle: React.CSSProperties = { height: 40, borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)", padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)", outline: "none" };

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
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }} className="max-lg:grid-cols-1">
      <SurfaceCard title="长期记忆" action={<Button variant="secondary" onClick={toggleMemory}>{memoryEnabled ? "关闭长期记忆" : "开启长期记忆"}</Button>}>
        <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
          <input aria-label="新记忆" disabled={!memoryEnabled} style={{ ...inputStyle, flex: 1 }} placeholder={memoryEnabled ? "添加一条长期记忆" : "长期记忆已关闭"} value={content} onChange={(e) => setContent(e.target.value)} />
          <Button disabled={!memoryEnabled || !content.trim()} onClick={createMemory}>创建</Button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {memories.map((m) => (
            <div key={m.id} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 16 }}>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--cm-text-strong)" }}>{m.content}</p>
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>{m.sensitivity}</span>
                <div style={{ display: "flex", gap: 8 }}><Button variant="secondary" onClick={() => editMemory(m)}>编辑</Button><Button variant="danger" onClick={() => deleteMemory(m.id)}>删除</Button></div>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
      <SurfaceCard title="隐私与数据">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button variant="secondary" onClick={exportData}>导出 JSON</Button>
          <p style={{ fontSize: 14, color: "var(--cm-text-muted)", margin: 0 }}>
            清空会删除画像成长数据并重新进入引导，但保留账号、角色和当前登录态。请输入确认词 <code style={{ background: "var(--cm-danger-bg)", padding: "2px 6px", borderRadius: 4 }}>CLEAR_MY_DATA</code>。
          </p>
          <input aria-label="清空确认词" style={{ ...inputStyle, width: "100%" }} value={clearConfirmation} onChange={(e) => setClearConfirmation(e.target.value)} />
          <Button variant="danger" disabled={clearConfirmation !== "CLEAR_MY_DATA"} onClick={clearData}>清空成长数据</Button>
        </div>
      </SurfaceCard>
      <SurfaceCard title="画像更新候选">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {candidates.map((c) => (
            <div key={c.id} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{c.field}</div>
              <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>{c.reason}</p>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <Button disabled={c.status !== "pending"} onClick={() => operate(c.id, "accept")}>确认</Button>
                <Button variant="secondary" disabled={c.status !== "pending"} onClick={() => operate(c.id, "reject")}>拒绝</Button>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}
