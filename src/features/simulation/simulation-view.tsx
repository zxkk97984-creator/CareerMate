"use client";

/** 模拟训练 —— 三场景选择、多轮对话、评分、历史记录 */
import { useState } from "react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { InlineAlert } from "@/components/ui/inline-alert";

/* ── 类型 ── */

interface ApiPayload<T> { ok: boolean; data: T; error?: { message: string }; }
interface TranscriptTurn { role: "user" | "assistant"; content: string }
interface SimulationSession { id: string; scenarioTitle: string; transcript: TranscriptTurn[]; status: string; turnCount: number; actualMode: string; score: number | null; }

const SCENARIOS = [
  { key: "cross_role_communication", title: "跨岗位沟通", desc: "与不同角色的同事高效协作" },
  { key: "ai_office", title: "AI 辅助办公", desc: "利用 AI 工具提升日常工作效率" },
  { key: "remote_collaboration", title: "远程协作", desc: "分布式团队的项目推进方法" },
];

/* ── 主视图 ── */

interface SimulationViewProps { simulations: SimulationSession[]; refresh: () => Promise<void>; setNotice: (v: string) => void; }

export function SimulationView({ simulations, refresh, setNotice }: SimulationViewProps) {
  const [selected, setSelected] = useState("");
  const [active, setActive] = useState<SimulationSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() { if (busy || !selected) return; setBusy(true); setError(""); setNotice("正在创建训练会话..."); try { const r = await fetch("/api/simulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioKey: selected }) }); const p: ApiPayload<SimulationSession> = await r.json(); if (!p.ok) throw new Error(p.error?.message ?? "创建失败"); setActive(p.data); setNotice("训练已开始，请回复第 1 轮问题。"); } catch (caught: any) { setError(caught.message ?? "创建训练失败"); } finally { setBusy(false); } }
  async function send() { if (!active || busy || !answer.trim()) return; setBusy(true); setError(""); setNotice("正在评估回答..."); try { const r = await fetch(`/api/simulations/${active.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: answer }) }); const p: ApiPayload<SimulationSession> = await r.json(); if (!p.ok) throw new Error(p.error?.message ?? "提交失败"); setActive(p.data); setAnswer(""); setNotice(`已完成第 ${p.data.turnCount} 轮。`); } catch (caught: any) { setError(caught.message ?? "提交失败"); } finally { setBusy(false); } }
  async function complete() { if (!active || busy) return; setBusy(true); setError(""); setNotice("正在生成评分..."); try { const r = await fetch(`/api/simulations/${active.id}/complete`, { method: "POST" }); const p: ApiPayload<SimulationSession> = await r.json(); if (!p.ok) throw new Error(p.error?.message ?? "评分失败"); setActive(p.data); setNotice(`训练完成，得分 ${p.data.score}。画像候选已生成，前往记忆权限确认。`); await refresh(); } catch (caught: any) { setError(caught.message ?? "评分失败"); } finally { setBusy(false); } }

  const canScore = active && active.turnCount >= 3;
  const recentSims = simulations.filter((s) => s.status === "completed").slice(0, 5);

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "360px 1fr" }} className="max-lg:grid-cols-1">
      <SurfaceCard title="训练场景">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              disabled={!!active}
              onClick={() => setSelected(s.key)}
              style={{
                width: "100%", textAlign: "left", padding: "12px 16px",
                borderRadius: "var(--cm-radius-control)", cursor: !!active ? "not-allowed" : "pointer",
                border: selected === s.key ? "2px solid var(--cm-brand)" : "1px solid var(--cm-border-strong)",
                background: selected === s.key ? "var(--cm-surface-soft)" : "var(--cm-surface)",
                color: "var(--cm-text-strong)", fontSize: 14, transition: "all var(--cm-duration-fast)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "var(--cm-text-muted)", marginTop: 2 }}>{s.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button disabled={!selected || !!active} onClick={start}>开始新训练</Button>
        </div>
      </SurfaceCard>

      <SurfaceCard title={active ? active.scenarioTitle : "训练区"}>
        {active ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusBadge tone={active.status === "completed" ? "success" : "info"}>
                {active.turnCount}/6 轮
              </StatusBadge>
              <span style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>
                至少 3 轮后可评分 · 模式：{active.actualMode || "mock"}
              </span>
            </div>

            <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {active.transcript.map((t, i) => (
                <div key={i} style={{
                  maxWidth: "85%", borderRadius: "var(--cm-radius-control)", padding: "10px 14px",
                  fontSize: 14, lineHeight: 1.5,
                  ...(t.role === "user"
                    ? { alignSelf: "flex-end", background: "var(--cm-brand)", color: "#fff" }
                    : { alignSelf: "flex-start", background: "var(--cm-canvas)", color: "var(--cm-text-strong)" }),
                }}>{t.content}</div>
              ))}
            </div>

            {active.status !== "completed" ? (
              <>
                <textarea
                  aria-label="训练回答"
                  style={{ width: "100%", minHeight: 72, borderRadius: "var(--cm-radius-control)", border: "1px solid var(--cm-border-strong)", padding: 12, fontSize: 14, color: "var(--cm-text-strong)", background: "var(--cm-surface)", resize: "vertical" }}
                  value={answer} onChange={(e) => setAnswer(e.target.value)}
                  placeholder="输入你的回答..."
                />
                {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
                <div style={{ display: "flex", gap: 8 }}>
                  <Button disabled={busy || !answer.trim()} onClick={send}>提交第 {active.turnCount + 1} 轮</Button>
                  {canScore && <Button variant="secondary" disabled={busy} onClick={complete}>完成并评分</Button>}
                </div>
              </>
            ) : (
              <div style={{ padding: 20, borderRadius: "var(--cm-radius-card)", background: "var(--cm-success-bg)", color: "var(--cm-success)", fontSize: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 18 }}>得分：{active.score}</div>
                <p style={{ marginTop: 8 }}>画像候选已生成并待确认，不会自动生效。请前往记忆权限页确认。</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--cm-text-muted)", fontSize: 14 }}>
            选择一个场景并开始训练
            {recentSims.length > 0 && (
              <div style={{ marginTop: 16, textAlign: "left" }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--cm-text-strong)" }}>最近训练</div>
                {recentSims.map((s) => (
                  <div key={s.id} style={{ padding: "6px 0", fontSize: 13, borderBottom: "1px solid var(--cm-border)" }}>
                    {s.scenarioTitle} · 得分 {s.score} · {s.turnCount} 轮
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
