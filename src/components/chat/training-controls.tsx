'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/client-api';
import type { SimulationSessionDto } from '@/lib/workspace-types';
import type { SimulationScenarioSnapshot } from '@/lib/simulation';
import { ScenarioDrawer } from '@/features/simulation/scenario-drawer';
import { SimulationReport } from '@/features/simulation/simulation-view';
import '@/features/simulation/simulation-lobby.css';

export function TrainingControls({ conversationId, streaming, onReload, onTrainingChange, onBusyChange }: {
 conversationId: string | null; streaming: boolean; onReload: () => Promise<void>; onTrainingChange: (session: SimulationSessionDto | null) => void; onBusyChange: (busy: boolean) => void;
}) {
 const [session, setSession] = useState<SimulationSessionDto | null>(null);
 const [details, setDetails] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
 const router = useRouter();
 const restartId = useRef<string | null>(null);
 useEffect(() => () => onTrainingChange(null), [conversationId, onTrainingChange]);
 useEffect(() => {
  let cancelled = false;
  setError('');
  if (!conversationId || streaming) return;
  void fetchApi<{ simulation: SimulationSessionDto | null }>(`/api/chat/conversations/${conversationId}`).then(result => {
   if (!cancelled && result.ok) { setSession(result.data.simulation); onTrainingChange(result.data.simulation); }
  }).catch(() => { if (!cancelled) setError('训练状态读取失败，请重新打开对话'); });
  return () => { cancelled = true; };
 }, [conversationId, streaming, onTrainingChange]);
 async function complete() {
  if (!session || busy) return;
  setBusy(true); setError('');
  try {
   const response = await fetchApi<{ session: SimulationSessionDto }>(`/api/simulations/${session.id}/complete`, { method: 'POST' });
   if (!response.ok) throw new Error(response.error?.message ?? '报告生成失败，请重试');
   setSession(response.data.session); onTrainingChange(response.data.session); await onReload();
  } catch (e) { setError(e instanceof Error ? e.message : '报告生成失败'); }
  finally { setBusy(false); }
 }
 async function restart() {
  if (!session || busy) return;
  setBusy(true); setError(''); restartId.current ??= crypto.randomUUID();
  try {
   const response = await fetchApi<{ conversationId: string }>('/api/simulations', { method: 'POST', body: JSON.stringify({ scenarioSnapshot: session.scenarioSnapshot ?? undefined, scenarioType: session.scenarioKey, sourceType: session.sourceType, sourceRef: session.sourceRef, roundLimit: session.roundLimit ?? 6, createConversation: true, requestId: restartId.current }) });
   if (!response.ok) throw new Error(response.error?.message ?? '创建失败');
   restartId.current = null; router.push(`/chat?conversationId=${response.data.conversationId}`);
  } catch (e) { setError(e instanceof Error ? e.message : '创建失败'); }
  finally { setBusy(false); }
 }
 if (!session) return error ? <div role="alert" className="chat-feedback">{error}</div> : null;
 const completed = session.status === 'completed';
 const snapshot = session.scenarioSnapshot as SimulationScenarioSnapshot | undefined;
 return <><div className="training-chat-bar"><Link href="/simulation">← 场景大厅</Link><span className="training-chat-progress">{completed ? '训练已完成 · 可以继续讨论报告' : `训练进行中 · ${session.turnCount}/${session.roundLimit ?? 6} 轮 · 至少 3 轮后可评分`}</span><button onClick={() => setDetails(true)}>场景详情</button>{completed ? <button onClick={() => void restart()} disabled={busy || streaming}>再次训练</button> : <button className="training-finish" onClick={() => void complete()} disabled={busy || streaming || session.turnCount < 3}>{busy ? '正在生成报告…' : '结束并生成报告'}</button>}</div>{error && <div className="chat-feedback" role="alert">{error}</div>}<ScenarioDrawer title={session.scenarioTitle} open={details} onClose={() => setDetails(false)}>{snapshot ? <dl className="training-details"><div><dt>背景</dt><dd>{snapshot.brief}</dd></div><div><dt>你的角色</dt><dd>{snapshot.role}</dd></div><div><dt>对方角色</dt><dd>{snapshot.counterpart}</dd></div><div><dt>训练目标</dt><dd>{snapshot.objective}</dd></div><div><dt>评分维度</dt><dd>{snapshot.scoringDimensions.join(' · ')}</dd></div></dl> : <p>旧训练未保存完整场景，已有记录仍可查看。</p>}</ScenarioDrawer></>;
}

export function TrainingReportRef({ sessionId }: { sessionId: string }) {
 const [session, setSession] = useState<SimulationSessionDto | null>(null);
 const [error, setError] = useState('');
 useEffect(() => { let cancelled = false; void fetchApi<SimulationSessionDto>(`/api/simulations/${sessionId}`).then(response => { if (cancelled) return; if (response.ok) setSession(response.data); else setError(response.error?.message ?? '报告读取失败'); }).catch(() => { if (!cancelled) setError('报告读取失败，请刷新重试'); }); return () => { cancelled = true; }; }, [sessionId]);
 if (!session) return <p role="status">{error || '正在读取训练报告…'}</p>;
 return <SimulationReport active={session}/>;
}
