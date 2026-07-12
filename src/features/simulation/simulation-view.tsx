"use client";

import { useState } from "react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";

interface ApiPayload<T> {
  ok: boolean;
  data: T;
  error?: { message: string };
}

interface TranscriptTurn { role: "user" | "assistant"; content: string }
interface SimulationSession {
  id: string;
  scenarioTitle: string;
  transcript: TranscriptTurn[];
  status: string;
  turnCount: number;
  actualMode: string;
  score: number | null;
}

const scenarios = [
  { key: "cross_role_communication", title: "跨岗位沟通", prompt: "你需要向技术负责人说明一个 AI 简历分析功能。请写出你的需求说明和需要澄清的问题。" },
  { key: "ai_office", title: "AI 辅助办公", prompt: "请把一次产品例会整理成行动项，并说明你会如何用 AI 工具提升效率。" },
  { key: "remote_collaboration", title: "远程协作", prompt: "项目延期风险出现了。请写一段异步进度同步，说明风险、影响和下一步。" },
] as const;

async function request<T>(url: string, init?: RequestInit): Promise<ApiPayload<T>> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return response.json();
}

export function SimulationView({ simulations, refresh, setNotice }: { simulations: SimulationSession[]; refresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [selected, setSelected] = useState<(typeof scenarios)[number]>(scenarios[0]);
  const [active, setActive] = useState<SimulationSession | null>(() => simulations.find((item) => item.status === "active") ?? simulations[0] ?? null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError(""); setNotice("正在创建模拟训练会话...");
    try {
      const response = await request<{ session: SimulationSession }>("/api/simulations", { method: "POST", body: JSON.stringify({ scenarioType: selected.key }) });
      if (!response.ok) throw new Error(response.error?.message ?? "训练会话创建失败");
      setActive(response.data.session); setNotice("训练已开始，请完成至少 3 轮回答。"); await refresh();
    } catch (caught) { const message = caught instanceof Error ? caught.message : "训练会话创建失败"; setError(message); setNotice(message); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!active || answer.trim().length < 5) return;
    setBusy(true); setError(""); setNotice("CareerMate 正在分析回答并准备追问...");
    try {
      const response = await request<{ session: SimulationSession }>(`/api/simulations/${active.id}/messages`, { method: "POST", body: JSON.stringify({ message: answer.trim() }) });
      if (!response.ok) throw new Error(response.error?.message ?? "训练回答提交失败");
      setActive(response.data.session); setAnswer(""); setNotice(`已完成第 ${response.data.session.turnCount} 轮训练。`); await refresh();
    } catch (caught) { const message = caught instanceof Error ? caught.message : "训练回答提交失败"; setError(message); setNotice(message); }
    finally { setBusy(false); }
  }

  async function complete() {
    if (!active) return;
    setBusy(true); setError(""); setNotice("正在生成训练评分和画像候选...");
    try {
      const response = await request<{ session: SimulationSession }>(`/api/simulations/${active.id}/complete`, { method: "POST" });
      if (!response.ok) throw new Error(response.error?.message ?? "训练评分失败");
      setActive(response.data.session); setNotice("训练已完成，已生成唯一画像更新候选。"); await refresh();
    } catch (caught) { const message = caught instanceof Error ? caught.message : "训练评分失败"; setError(message); setNotice(message); }
    finally { setBusy(false); }
  }

  return <div style={{ display: "grid", gap: 20, gridTemplateColumns: "360px 1fr" }} className="max-lg:grid-cols-1">
    <SurfaceCard title="训练场景"><div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{scenarios.map((scenario) => <button key={scenario.key} disabled={busy || active?.status === "active"} onClick={() => setSelected(scenario)} style={{ width: "100%", borderRadius: "var(--cm-radius-sm)", border: selected.key === scenario.key ? "2px solid var(--cm-brand)" : "1px solid var(--cm-border-strong)", background: selected.key === scenario.key ? "var(--cm-surface-soft)" : "var(--cm-surface)", color: selected.key === scenario.key ? "var(--cm-brand)" : "var(--cm-text-strong)", padding: 16, textAlign: "left", cursor: "pointer", fontSize: 14, fontWeight: 600 }}><div>{scenario.title}</div><div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>{scenario.prompt}</div></button>)}</div><div style={{ marginTop: 16 }}><Button disabled={busy || active?.status === "active"} onClick={start}>开始新训练</Button></div></SurfaceCard>
    <SurfaceCard title={active?.scenarioTitle ?? selected.title}>
      {error ? <p style={{ marginBottom: 16, borderRadius: "var(--cm-radius-sm)", background: "var(--cm-danger-bg)", padding: "8px 12px", fontSize: 14, color: "var(--cm-danger)" }}>{error}</p> : null}
      {active ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{active.transcript.map((turn, index) => <div key={`${turn.role}-${index}`} style={{ borderRadius: "var(--cm-radius-sm)", padding: 12, fontSize: 14, lineHeight: 1.6, ...(turn.role === "user" ? { marginLeft: 32, background: "var(--cm-brand)", color: "#fff" } : { marginRight: 32, background: "var(--cm-canvas)", color: "var(--cm-text-strong)" }) }}>{turn.content}</div>)}{active.status === "active" ? <><textarea aria-label="训练回答" style={{ minHeight: 112, width: "100%", borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border-strong)", padding: 12, fontSize: 14, color: "var(--cm-text-strong)", background: "var(--cm-surface)" }} placeholder="输入不少于 5 个字的回答" value={answer} onChange={(event) => setAnswer(event.target.value)} /><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Button disabled={busy || answer.trim().length < 5 || active.turnCount >= 6} onClick={send}>提交第 {active.turnCount + 1} 轮</Button><Button variant="secondary" disabled={busy || active.turnCount < 3} onClick={complete}>完成并评分</Button></div><p style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>已完成 {active.turnCount}/6 轮，至少 3 轮后可评分。实际模式：{active.actualMode}</p></> : <div style={{ borderRadius: "var(--cm-radius-sm)", background: "var(--cm-success-bg)", padding: 16, fontSize: 14, color: "var(--cm-success)" }}>训练得分：{active.score} 分。画像候选已生成，可前往&ldquo;记忆权限&rdquo;确认。</div>}</div> : <p style={{ fontSize: 14, color: "var(--cm-text-muted)" }}>选择场景并开始训练。</p>}
      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>{simulations.slice(0, 5).map((item) => <div key={item.id} style={{ borderRadius: "var(--cm-radius-sm)", border: "1px solid var(--cm-border)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ fontWeight: 600, color: "var(--cm-text-strong)", fontSize: 14 }}>{item.scenarioTitle}</div><button onClick={() => setActive(item)} style={{ borderRadius: 999, background: "var(--cm-canvas)", border: "none", padding: "4px 12px", fontSize: 14, color: "var(--cm-text-muted)", cursor: "pointer" }}>{item.status === "completed" ? `${item.score} 分` : `${item.turnCount} 轮`}</button></div>)}</div>
    </SurfaceCard>
  </div>;
}
