"use client";

import { useState, type ReactNode } from "react";

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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">{title}</h2></div><div className="p-5">{children}</div></section>;
}

function Button({ children, onClick, disabled, secondary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`h-10 rounded-md px-4 text-sm font-semibold ${secondary ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "bg-slate-950 text-white hover:bg-slate-800"}`}>{children}</button>;
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

  return <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
    <Panel title="训练场景"><div className="space-y-3">{scenarios.map((scenario) => <button key={scenario.key} disabled={busy || active?.status === "active"} onClick={() => setSelected(scenario)} className={`w-full rounded-md border p-4 text-left ${selected.key === scenario.key ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}><div className="text-sm font-semibold">{scenario.title}</div><div className="mt-2 text-xs opacity-75">{scenario.prompt}</div></button>)}</div><div className="mt-4"><Button disabled={busy || active?.status === "active"} onClick={start}>开始新训练</Button></div></Panel>
    <Panel title={active?.scenarioTitle ?? selected.title}>
      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {active ? <div className="space-y-3">{active.transcript.map((turn, index) => <div key={`${turn.role}-${index}`} className={`rounded-md p-3 text-sm leading-6 ${turn.role === "user" ? "ml-8 bg-slate-950 text-white" : "mr-8 bg-slate-100 text-slate-700"}`}>{turn.content}</div>)}{active.status === "active" ? <><textarea aria-label="训练回答" className="min-h-28 w-full rounded-md border border-slate-200 p-3 text-sm leading-6" placeholder="输入不少于 5 个字的回答" value={answer} onChange={(event) => setAnswer(event.target.value)} /><div className="flex flex-wrap gap-2"><Button disabled={busy || answer.trim().length < 5 || active.turnCount >= 6} onClick={send}>提交第 {active.turnCount + 1} 轮</Button><Button secondary disabled={busy || active.turnCount < 3} onClick={complete}>完成并评分</Button></div><p className="text-xs text-slate-500">已完成 {active.turnCount}/6 轮，至少 3 轮后可评分。实际模式：{active.actualMode}</p></> : <div className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">训练得分：{active.score} 分。画像候选已生成，可前往“记忆权限”确认。</div>}</div> : <p className="text-sm text-slate-500">选择场景并开始训练。</p>}
      <div className="mt-6 space-y-3">{simulations.slice(0, 5).map((item) => <div key={item.id} className="rounded-md border border-slate-200 p-4"><div className="flex items-center justify-between"><div className="font-semibold text-slate-900">{item.scenarioTitle}</div><button className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700" onClick={() => setActive(item)}>{item.status === "completed" ? `${item.score} 分` : `${item.turnCount} 轮`}</button></div></div>)}</div>
    </Panel>
  </div>;
}
