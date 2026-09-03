"use client";

import { useCallback, useEffect, useState } from "react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { BarChart3, Bot, CheckCircle2, ListChecks, MessagesSquare, Sparkles, Timer, Users } from "lucide-react";
import { abilityLabels, type ProfileDto } from "@/lib/types";
import { listSimulationScenarios, type SimulationScenarioMeta } from "@/lib/simulation";

interface ApiPayload<T> {
  ok: boolean;
  data: T;
  error?: { message: string };
}

interface TranscriptTurn { role: "user" | "assistant"; content: string }

interface SimulationFeedback {
  score?: number;
  strengths?: string[];
  improvements?: string[];
  evidence?: string[];
  abilityImpact?: Record<string, number>;
  candidateUpdates?: unknown[];
}

interface SimulationSession {
  id: string;
  scenarioKey?: string;
  scenarioTitle: string;
  transcript: TranscriptTurn[];
  status: string;
  turnCount: number;
  actualMode: string;
  score: number | null;
  candidateId?: string | null;
  feedback?: SimulationFeedback | null;
}

const fixedScenarios = listSimulationScenarios();

const scenarioIcons: Record<string, typeof MessagesSquare> = {
  cross_role_communication: MessagesSquare,
  ai_office: Bot,
  remote_collaboration: Users,
  data_driven_decision: BarChart3,
  requirement_clarification: ListChecks,
  career_interview: Sparkles,
};

async function request<T>(url: string, init?: RequestInit): Promise<ApiPayload<T>> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return response.json();
}

/** 大分数圆环 */
function ScoreRing({ score }: { score: number | null }) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const R = 42;
  const C = 2 * Math.PI * R;
  return (
    <div className="sim-report-score" role="img" aria-label={`综合得分 ${value} 分`}>
      <svg viewBox="0 0 96 96" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <circle className="sim-report-score-track" cx="48" cy="48" r={R} fill="none" strokeWidth="8" />
        <circle
          className="sim-report-score-arc"
          cx="48"
          cy="48"
          r={R}
          fill="none"
          stroke="var(--cm-brand)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * C} ${C}`}
        />
      </svg>
      <span className="sim-report-score-num">{value}</span>
      <span className="sim-report-score-label">综合得分</span>
    </div>
  );
}

function SimulationReport({ active, onRestart }: { active: SimulationSession; onRestart: () => void }) {
  const fb = active.feedback;
  const impacts = fb?.abilityImpact && typeof fb.abilityImpact === "object" ? Object.entries(fb.abilityImpact) : [];
  return (
    <div className="sim-report">
      <div className="sim-report-head">
        <ScoreRing score={active.score} />
        <div className="sim-report-summary">
          {active.candidateId ? <span className="sim-report-badge sim-report-badge-brand">画像候选已生成</span> : <span className="sim-report-badge">本次未生成画像候选</span>}
        </div>
      </div>
      {impacts.length > 0 ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">能力影响</div>
          <div className="sim-impact-list">
            {impacts.map(([key, value]) => (
              <div key={key} className="sim-impact-row">
                <span className="sim-impact-label">{abilityLabels[key as keyof typeof abilityLabels] ?? key}</span>
                <span className="sim-impact-track"><span className="sim-impact-bar" style={{ width: Math.min(100, Math.max(0, Number(value) * 20)) + "%" }} /></span>
                <span className="sim-impact-value">+{value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {fb?.strengths && fb.strengths.length > 0 ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">做得好</div>
          <ul className="sim-report-list">
            {fb.strengths.map((s) => <li key={s}><CheckCircle2 size={14} />{s}</li>)}
          </ul>
        </div>
      ) : null}
      {fb?.improvements && fb.improvements.length > 0 ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">改进建议</div>
          <ul className="sim-report-list">
            {fb.improvements.map((s) => <li key={s}><Sparkles size={14} />{s}</li>)}
          </ul>
        </div>
      ) : null}
      {fb?.evidence && fb.evidence.length > 0 ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">证据摘录</div>
          <ul className="sim-report-list sim-report-list-quote">
            {fb.evidence.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      ) : null}
      <div className={active.candidateId ? "sim-report-cta" : "sim-report-note"}>
        {active.candidateId ? <>画像更新候选已生成，可前往<a href="/memory">“记忆权限”</a>确认。</> : "本次未生成画像更新候选。"}
      </div>
      <div className="sim-report-actions">
        <Button variant="secondary" onClick={onRestart}>再来一次</Button>
      </div>
    </div>
  );
}

export function SimulationView({ simulations, refresh, setNotice }: { simulations: SimulationSession[]; profile: ProfileDto | null; refresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [scenarios, setScenarios] = useState<SimulationScenarioMeta[]>(fixedScenarios);
  const [selected, setSelected] = useState<SimulationScenarioMeta>(fixedScenarios[0]);
  const [active, setActive] = useState<SimulationSession | null>(() => simulations.find((item) => item.status === "active") ?? simulations[0] ?? null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generatingScenarios, setGeneratingScenarios] = useState(false);

  const generateScenarios = useCallback(async () => {
    setGeneratingScenarios(true);
    setNotice("正在根据目标岗位生成训练/面试场景...");
    try {
      const response = await request<{ items: SimulationScenarioMeta[] }>("/api/simulations/scenarios");
      if (!response.ok) throw new Error(response.error?.message ?? "场景生成失败");
      if (!Array.isArray(response.data.items) || response.data.items.length === 0) {
        throw new Error("场景生成结果为空");
      }
      setScenarios(response.data.items);
      setSelected((current) => response.data.items.find((item) => item.key === current.key) ?? response.data.items[0]);
      setNotice("已按目标岗位生成训练/面试场景。");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "场景生成失败";
      setNotice(message);
    } finally {
      setGeneratingScenarios(false);
    }
  }, [setNotice]);

  // 外部刷新后自动同步“进行中的训练”，避免遗留会话挡住新训练
  useEffect(() => {
    if (active) return;
    const found = simulations.find((item) => item.status === "active") ?? null;
    if (found) setActive(found);
  }, [simulations, active]);

  // 首次进入时自动生成一次
  useEffect(() => {
    void generateScenarios();
  }, [generateScenarios]);

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
      const response = await request<{ session: SimulationSession }>("/api/simulations/" + active.id + "/messages", { method: "POST", body: JSON.stringify({ message: answer.trim() }) });
      if (!response.ok) throw new Error(response.error?.message ?? "训练回答提交失败");
      setActive(response.data.session); setAnswer(""); setNotice("已完成第 " + response.data.session.turnCount + " 轮训练。"); await refresh();
    } catch (caught) { const message = caught instanceof Error ? caught.message : "训练回答提交失败"; setError(message); setNotice(message); }
    finally { setBusy(false); }
  }

  async function complete() {
    if (!active) return;
    setBusy(true); setError(""); setNotice("正在生成训练评分和画像候选...");
    try {
      const response = await request<{ session: SimulationSession; candidateId?: string | null }>("/api/simulations/" + active.id + "/complete", { method: "POST" });
      if (!response.ok) throw new Error(response.error?.message ?? "训练评分失败");
      setActive(response.data.session);
      const cid = response.data.candidateId ?? response.data.session.candidateId;
      if (response.data.session.score === null) {
        setNotice("训练已完成，但本次未产生正式评分；如需评分，请开始一轮新训练。");
      } else if (cid) {
        setNotice("训练已完成，画像更新候选等待确认。");
      } else {
        setNotice("训练已完成，本次未生成画像更新候选。");
      }
      await refresh();
    } catch (caught) { const message = caught instanceof Error ? caught.message : "训练评分失败"; setError(message); setNotice(message); }
    finally { setBusy(false); }
  }

  const scenarioCards = (
    <div className="sim-scenario-list">
      {scenarios.map((scenario) => {
        const Icon = scenarioIcons[scenario.key] ?? MessagesSquare;
        const skillLabels = scenario.skills.slice(0, 2).map((s) => abilityLabels[s as keyof typeof abilityLabels] ?? s);
        const isSelected = selected.key === scenario.key;
        return (
          <button
            key={scenario.key}
            className={`sim-scenario-btn ${isSelected ? "selected" : ""}`}
            disabled={busy || active?.status === "active"}
            onClick={() => setSelected(scenario)}
          >
            <div className="sim-scenario-head">
              <span className="sim-scenario-icon" aria-hidden="true"><Icon size={16} /></span>
              <span className="sim-scenario-title">{scenario.title}</span>
              <span className={`sim-scenario-diff sim-scenario-diff-${scenario.difficulty.toLowerCase()}`}>{scenario.difficulty}</span>
            </div>
            <div className="sim-scenario-prompt">{scenario.brief}</div>
            <div className="sim-scenario-chips">
              <span className="sim-scenario-chip"><Timer size={11} />{scenario.durationMinutes} 分钟</span>
              {skillLabels.map((label) => <span key={label} className="sim-scenario-chip">{label}</span>)}
            </div>
            <div className="sim-scenario-meta">6 轮对话 · AI 评分</div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="sim-layout" data-od-id="simulation-layout">
      {/* 左侧 360px：场景列表 */}
      <SurfaceCard title="训练场景" description="按目标岗位生成的训练与面试" action={<Button variant="secondary" disabled={generatingScenarios || busy} onClick={generateScenarios}>{generatingScenarios ? "生成中..." : "生成"}</Button>}>
        {scenarioCards}
      </SurfaceCard>

      {/* 右侧：情境卡 + 会话面板 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        {/* 情境卡 */}
        <SurfaceCard title="情境卡" description="进入训练前先了解本场设定">
          <div className="sim-brief" style={{ marginTop: 0 }}>
            <div className="sim-brief-line"><span className="sim-brief-label">你的角色</span><span>{selected.role}</span></div>
            <div className="sim-brief-line"><span className="sim-brief-label">对话对象</span><span>{selected.counterpart}</span></div>
            <div className="sim-brief-line"><span className="sim-brief-label">目标</span><span>{selected.objective}</span></div>
            <div className="sim-brief-dims">
              {selected.scoringDimensions.map((d) => <span key={d} className="sim-brief-dim">{d}</span>)}
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <Button disabled={busy || active?.status === "active"} onClick={start}>开始新训练</Button>
            <span style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>完成至少 3 轮后可评分</span>
          </div>
        </SurfaceCard>

        {/* 会话面板 */}
        <SurfaceCard title={active?.scenarioTitle ?? selected.title} description={active ? `已进行 ${active.turnCount}/6 轮` : undefined}>
          {error ? <p className="sim-error">{error}</p> : null}
          {active ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {active.transcript.map((turn, index) => (
                <div key={turn.role + "-" + index} className={`sim-turn ${turn.role === "user" ? "sim-turn-user" : "sim-turn-assistant"}`}>{turn.content}</div>
              ))}
              {active.status === "active" ? (
                <>
                  <textarea
                    aria-label="训练回答"
                    className="sim-answer"
                    placeholder="输入不少于 5 个字的回答"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Button disabled={busy || answer.trim().length < 5 || active.turnCount >= 6} onClick={send}>提交第 {active.turnCount + 1} 轮</Button>
                    <Button variant="secondary" disabled={busy || active.turnCount < 3} onClick={complete}>完成并评分</Button>
                  </div>
                  <p className="sim-round-hint">已完成 {active.turnCount}/6 轮，至少 3 轮后可评分。</p>
                </>
              ) : active.score === null ? (
                <div className="sim-done-note">训练已完成，本次未产生正式评分。</div>
              ) : (
                <SimulationReport active={active} onRestart={start} />
              )}
            </div>
          ) : (
            <p className="sim-empty">选择场景并开始训练。</p>
          )}

          {simulations.length > 0 && (
            <div className="sim-history">
              {simulations.slice(0, 5).map((item) => (
                <div key={item.id} className="sim-history-row">
                  <div className="sim-history-main">
                    <div className="sim-history-title">{item.scenarioTitle}</div>
                    <div className="sim-history-meta">{item.status === "completed" ? (item.score === null ? "未评分" : "得分 " + item.score) : "进行中 " + item.turnCount + "/6 轮"}</div>
                  </div>
                  <button onClick={() => setActive(item)} className="sim-history-btn">{item.status === "completed" ? (item.score === null ? "查看" : item.score + " 分") : item.turnCount + " 轮"}</button>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
