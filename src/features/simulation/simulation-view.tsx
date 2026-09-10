"use client";

/**
 * 模拟训练：推荐场景与自定义场景双入口。
 *
 * 两个入口都先预览，用户可以编辑场景；点击开始后服务端保存场景、
 * 角色、目标、难度、评分标准和来源快照，训练过程中不再被模型改写。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScenarioDrawer } from "./scenario-drawer";
import "./simulation-lobby.css";
import { ArrowLeft, BarChart3, Bot, CheckCircle2, ListChecks, MessagesSquare, Sparkles, Timer, Users } from "lucide-react";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { extractAiExecutionMeta, fetchApi } from "@/lib/client-api";
import {
  formatAbilityImpact,
  impactBarPercent,
  listSimulationScenarios,
  type SimulationScenarioMeta,
  type SimulationScenarioSnapshot,
} from "@/lib/simulation";
import { abilityLabels, type ProfileDto } from "@/lib/types";
import type { SimulationSessionDto } from "@/lib/workspace-types";

interface SimulationFeedback {
  score?: number;
  strengths?: string[];
  improvements?: string[];
  evidence?: string[];
  abilityImpact?: Record<string, number>;
  candidateUpdates?: unknown[];
}

type SimulationSession = SimulationSessionDto & { feedback?: SimulationFeedback | null };

interface ScenarioDraft {
  sourceType: "recommended" | "custom" | "job";
  sourceRef: string | null;
  scenarioSnapshot: SimulationScenarioSnapshot;
  executionMeta?: ReturnType<typeof extractAiExecutionMeta>;
}

const fixedScenarios = listSimulationScenarios();

const scenarioIcons: Record<string, typeof MessagesSquare> = {
  cross_role_communication: MessagesSquare,
  ai_office: Bot,
  remote_collaboration: Users,
  data_driven_decision: BarChart3,
  requirement_clarification: ListChecks,
  career_interview: Sparkles,
  custom: Sparkles,
};

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="sim-report-score sim-report-score-none" role="img" aria-label="本次训练未评分">
        <span className="sim-report-score-num">—</span>
        <span className="sim-report-score-label">未产生正式评分</span>
      </div>
    );
  }
  const value = Math.max(0, Math.min(100, score));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="sim-report-score" role="img" aria-label={`综合得分 ${value} 分`}>
      <svg viewBox="0 0 96 96" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <circle className="sim-report-score-track" cx="48" cy="48" r={radius} fill="none" strokeWidth="8" />
        <circle
          className="sim-report-score-arc"
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="var(--cm-brand)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="sim-report-score-num">{value}</span>
      <span className="sim-report-score-label">综合得分</span>
    </div>
  );
}

export function SimulationReport({ active, onRestart }: { active: SimulationSession; onRestart?: () => void }) {
  const feedback = active.feedback;
  const impacts = feedback?.abilityImpact && typeof feedback.abilityImpact === "object"
    ? Object.entries(feedback.abilityImpact)
    : [];
  const degraded = active.actualMode === "mock";
  return (
    <div className="sim-report">
      <div className="sim-report-head">
        <ScoreRing score={active.score} />
        <div className="sim-report-summary">
          {active.candidateId
            ? <span className="sim-report-badge sim-report-badge-brand">能力证据候选已生成，等待确认</span>
            : <span className="sim-report-badge">本次未生成能力证据候选</span>}
        </div>
      </div>
      {degraded ? <p className="sim-report-degraded">本次使用演示数据（结果仅供参考，不生成正式能力候选）</p> : null}
      {impacts.length > 0 ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">能力影响（未确认前不写入画像）</div>
          <div className="sim-impact-list">
            {impacts.map(([key, value]) => {
              const number = Number(value);
              return (
                <div key={key} className="sim-impact-row">
                  <span className="sim-impact-label">{abilityLabels[key as keyof typeof abilityLabels] ?? key}</span>
                  <span className="sim-impact-track"><span className="sim-impact-bar" style={{ width: `${impactBarPercent(number)}%` }} /></span>
                  <span className={`sim-impact-value ${number < 0 ? "sim-impact-value-neg" : ""}`}>{formatAbilityImpact(number)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {feedback?.strengths?.length ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">做得好</div>
          <ul className="sim-report-list">{feedback.strengths.map((item) => <li key={item}><CheckCircle2 size={14} />{item}</li>)}</ul>
        </div>
      ) : null}
      {feedback?.improvements?.length ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">改进建议</div>
          <ul className="sim-report-list">{feedback.improvements.map((item) => <li key={item}><Sparkles size={14} />{item}</li>)}</ul>
        </div>
      ) : null}
      {feedback?.evidence?.length ? (
        <div className="sim-report-section">
          <div className="sim-report-section-title">报告依据（来自你的实际回答）</div>
          <ul className="sim-report-list sim-report-list-quote">{feedback.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ) : (
        <p className="sim-report-degraded">报告没有可用回答摘录，未观察到的能力不应视为已具备。</p>
      )}
      <div className={active.candidateId ? "sim-report-cta" : "sim-report-note"}>
        {active.candidateId
          ? <>能力证据候选已生成，可前往 <a href="/memory?tab=candidates">待确认建议</a> 审阅。候选未确认前不写入正式画像。</>
          : "本次未生成能力更新候选。"}
      </div>
      <div className="sim-report-actions">
        {onRestart && <Button variant="secondary" onClick={onRestart}>再来一次</Button>}
        <Link href="/path" className="sim-report-back" aria-label="返回任务"><ArrowLeft size={14} /> 返回任务</Link>
      </div>
    </div>
  );
}

export function ScenarioPreview({
  draft,
  busy,
  onEdit,
  onStart,
}: {
  draft: ScenarioDraft;
  busy: boolean;
  onEdit: (snapshot: SimulationScenarioSnapshot) => void;
  onStart: () => void;
}) {
  const snapshot = draft.scenarioSnapshot;
  const update = (patch: Partial<SimulationScenarioSnapshot>) => {
    const next = { ...snapshot, ...patch };
    if ("role" in patch || "counterpart" in patch || "objective" in patch) {
      next.openingMessage = `你是${next.role}，对方是${next.counterpart}。请围绕“${next.objective}”说明你的第一步行动。`;
    }
    onEdit(next);
  };
  return (
    <div className="sim-preview" data-od-id="simulation-preview">
      <div className="sim-preview-head">
        <div>
          <span className="path-eyebrow">开始前预览</span>
          <h3>{snapshot.title}</h3>
          <p>确认角色和目标后，进入专属对话开始练习。训练将围绕以下情境展开。</p>
        </div>
        <Button disabled={busy} onClick={onStart}>开始训练</Button>
      </div>
      <div className="sim-preview-grid">
        <label>场景标题<input className="cm-input" value={snapshot.title} onChange={(event) => update({ title: event.target.value })} /></label>
        <label>难度<select className="cm-select" value={snapshot.difficulty} onChange={(event) => update({ difficulty: event.target.value as SimulationScenarioSnapshot["difficulty"] })}><option value="L1">L1</option><option value="L2">L2</option><option value="L3">L3</option></select></label>
        <label>你的角色<input className="cm-input" value={snapshot.role} onChange={(event) => update({ role: event.target.value })} /></label>
        <label>对话对象<input className="cm-input" value={snapshot.counterpart} onChange={(event) => update({ counterpart: event.target.value })} /></label>
        <label className="sim-preview-wide">目标<textarea className="cm-input-textarea" value={snapshot.objective} onChange={(event) => update({ objective: event.target.value })} /></label>
        <label className="sim-preview-wide">情境说明<textarea className="cm-input-textarea" value={snapshot.brief} onChange={(event) => update({ brief: event.target.value })} /></label>
        <label className="sim-preview-wide">评分标准（用、分隔）<input className="cm-input" value={snapshot.scoringDimensions.join("、")} onChange={(event) => update({ scoringDimensions: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} /></label>
      </div>
      <div className="sim-preview-meta">
        <span><Timer size={13} />{snapshot.durationMinutes} 分钟</span>
        <span>最多 6 轮 · 至少 3 轮有效回答后可评分</span>
        <span>来源：{draft.sourceType === "custom" ? "自定义场景" : draft.sourceType === "job" ? "岗位样本" : "推荐场景"}</span>
      </div>
      {draft.executionMeta?.degraded ? (
        <InlineAlert tone="info">场景生成已降级为本地模板，当前内容仅供预览；确认后再开始训练。</InlineAlert>
      ) : null}
    </div>
  );
}

export function SimulationView({ simulations, profile, setNotice }: {
 simulations: SimulationSession[]; profile: ProfileDto | null; refresh: () => Promise<void>; setNotice: (value: string) => void;
}) {
 const router = useRouter();
 const [mode, setMode] = useState<'recommended' | 'custom'>('recommended');
 const [scenarios, setScenarios] = useState(fixedScenarios);
 const [draft, setDraft] = useState<ScenarioDraft | null>(null);
 const [loading, setLoading] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const requestId = useRef<string | null>(null);
 const [custom, setCustom] = useState({ description: '', role: profile?.targetRoleLabel ?? '岗位候选人', counterpart: '业务负责人', objective: '', difficulty: 'L2' });
 const refreshScenarios = useCallback(async () => {
  try {
   const response = await fetchApi<{ items: SimulationScenarioMeta[] }>('/api/simulations/scenarios');
   if (response.ok && response.data.items.length) setScenarios(response.data.items);
  } catch { setNotice('推荐刷新失败，保留当前场景。'); }
 }, [setNotice]);
 useEffect(() => { void refreshScenarios(); }, [refreshScenarios]);
 const preview = useCallback(async (body: Record<string, unknown>) => {
  setLoading(true); setError(''); requestId.current = null;
  try {
   const response = await fetchApi<ScenarioDraft>('/api/simulations/scenarios', { method: 'POST', body: JSON.stringify(body) });
   if (!response.ok) throw new Error(response.error?.message ?? '场景生成失败，请重试');
   setDraft({ ...response.data, executionMeta: extractAiExecutionMeta(response.meta) });
  } catch (e) { setError(e instanceof Error ? e.message : '场景生成失败'); }
  finally { setLoading(false); }
 }, []);
 useEffect(() => {
  const jobId = new URLSearchParams(window.location.search).get('jobId');
  if (jobId) void preview({ mode: 'recommended', jobId });
 }, [preview]);
 async function start() {
  if (!draft || busy) return;
  setBusy(true); setError(''); requestId.current ??= crypto.randomUUID();
  try {
   const response = await fetchApi<{ conversationId: string }>('/api/simulations', { method: 'POST', body: JSON.stringify({ ...draft, executionMeta: undefined, roundLimit: 6, createConversation: true, requestId: requestId.current }) });
   if (!response.ok) throw new Error(response.error?.message ?? '训练创建失败，请重试');
   if (!response.data.conversationId) throw new Error('训练聊天未创建，请重试');
   router.push(`/chat?conversationId=${encodeURIComponent(response.data.conversationId)}`);
  } catch (e) { setError(e instanceof Error ? e.message : '创建失败'); setBusy(false); }
 }
 async function resume(id: string) {
  setBusy(true); setError('');
  try {
   const response = await fetchApi<{ conversationId: string }>(`/api/simulations/${id}/conversation`, { method: 'POST' });
   if (!response.ok) throw new Error(response.error?.message ?? '恢复训练失败');
   router.push(`/chat?conversationId=${encodeURIComponent(response.data.conversationId)}`);
  } catch (e) { setError(e instanceof Error ? e.message : '恢复失败'); setBusy(false); }
 }
 return <div className="training-lobby">
  <header className="training-hero"><span className="training-eyebrow">PRACTICE & GROW</span><h1>把真实挑战，变成你的练习场</h1><p>选一个场景，与 AI 展开一对一模拟。练习表达、应对追问，找到下一次做得更好的方法。</p><div className="training-steps"><span>01 选择场景</span><span>02 对话练习</span><span>03 获取反馈</span></div></header>
  <div className="training-toolbar"><div className="sim-entry-tabs" aria-label="训练场景入口"><button aria-pressed={mode === 'recommended'} className={mode === 'recommended' ? 'active' : ''} onClick={() => setMode('recommended')}>推荐场景</button><button aria-pressed={mode === 'custom'} className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>自定义场景</button></div><span>一场专注的对话，一次看得见的进步</span></div>
  {error && !draft ? <InlineAlert tone="error">{error}</InlineAlert> : null}
  {loading ? <p role="status" className="training-loading">正在准备场景预览，请稍候…</p> : null}
  {mode === 'recommended' ? <div className="training-grid">{scenarios.map(scenario => {
   const Icon = scenarioIcons[scenario.key] ?? MessagesSquare;
   return <button key={scenario.key} className="training-card" disabled={loading || busy} onClick={() => void preview({ mode: 'recommended', scenarioType: scenario.key })}>
    <div className="training-card-top"><span className="training-icon"><Icon size={23}/></span><span>{scenario.difficulty} · {scenario.durationMinutes} 分钟</span></div>
    <h2>{scenario.title}</h2><p>{scenario.brief}</p><div className="training-role">你的角色 · {scenario.role}</div><div className="training-objective">目标 · {scenario.objective}</div><div className="training-tags">{scenario.skills.slice(0, 3).map(key => <span key={key}>{abilityLabels[key as keyof typeof abilityLabels] ?? key}</span>)}</div><div className="training-card-footer"><span>最多 6 轮对话</span><strong>预览场景 ↗</strong></div>
   </button>;
  })}</div> : <SurfaceCard title="你想练习什么？" description="描述一个具体情境，AI 会为你准备角色、任务与训练目标。"><div className="sim-custom-form training-custom">
   <label className="training-wide">事件经过<textarea className="cm-input-textarea" value={custom.description} onChange={e => setCustom({ ...custom, description: e.target.value })} placeholder="例如：项目延期，我需要向跨部门同事说明风险，并协商新的交付安排。"/></label>
   <label>你的角色<input className="cm-input" value={custom.role} onChange={e => setCustom({ ...custom, role: e.target.value })}/></label><label>对方角色<input className="cm-input" value={custom.counterpart} onChange={e => setCustom({ ...custom, counterpart: e.target.value })}/></label>
   <label className="training-wide">训练目标<input className="cm-input" value={custom.objective} onChange={e => setCustom({ ...custom, objective: e.target.value })} placeholder="例如：清楚表达风险，提出可执行的下一步"/></label><label>挑战难度<select className="cm-select" value={custom.difficulty} onChange={e => setCustom({ ...custom, difficulty: e.target.value })}><option value="L1">L1 · 入门练习</option><option value="L2">L2 · 进阶挑战</option><option value="L3">L3 · 高压应对</option></select></label>
   <div className="training-wide"><Button disabled={loading || busy || custom.description.trim().length < 10 || custom.objective.trim().length < 5} onClick={() => void preview({ mode: 'custom', ...custom })}>生成场景预览</Button></div>
  </div></SurfaceCard>}
  <section className="training-history"><div className="training-section-heading"><h2>最近训练</h2><span>每一次练习，都值得回看</span></div>{simulations.length ? simulations.slice(0, 8).map(item => <button className="training-history-item" key={item.id} disabled={busy} onClick={() => void resume(item.id)}><span className="training-icon"><MessagesSquare size={19}/></span><span><strong>{item.scenarioTitle}</strong><small>{item.status === 'completed' ? (item.score == null ? '未产生正式评分' : `已完成 · ${item.score} 分`) : `进行中 · ${item.turnCount}/${item.roundLimit ?? 6} 轮`} · {new Date(item.createdAt).toLocaleDateString('zh-CN')}</small></span><span className="training-history-action">{item.status === 'completed' ? '查看报告' : '继续训练'} →</span></button>) : <p className="training-empty">还没有训练记录。从上方选一个场景，开始第一次练习。</p>}</section>
  <ScenarioDrawer open={!!draft} onClose={() => { if (!busy) setDraft(null); }} title="训练场景预览">{draft && <>{error && <InlineAlert tone="error">{error}</InlineAlert>}<ScenarioPreview draft={draft} busy={busy} onEdit={snapshot => { requestId.current = null; setDraft({ ...draft, scenarioSnapshot: snapshot }); }} onStart={() => void start()}/></>}</ScenarioDrawer>
 </div>;
}
