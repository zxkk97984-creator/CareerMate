"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, ShieldCheck, Target, X } from "lucide-react";
interface Profile { targetRoleLabel?: string | null; major?: string | null; weeklyAvailableHours?: number | null; onboardingCompleted: boolean; }
export function GrowthProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void; pendingCandidateCount: number }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    fetch("/api/me", { signal: abort.signal }).then(r => r.json()).then(b => { if (!b.ok) throw new Error(); setProfile(b.data.profile); setError(false); }).catch(() => { if (!abort.signal.aborted) setError(true); });
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => { abort.abort(); window.removeEventListener("keydown", close); };
  }, [open, onClose]);
  if (!open) return null;
  return <aside className="growth-drawer drawer-open" aria-label="成长档案">
    <header className="drawer-header"><h2>成长档案</h2><button onClick={onClose} aria-label="收起成长档案"><X size={20}/></button></header>
    <div className="drawer-content">
      {error ? <p role="alert">档案暂时无法加载，请关闭后重试。</p> : !profile ? <p role="status">正在读取档案…</p> : <>
        <section className="drawer-section"><Target size={20}/><p className="drawer-label">目标岗位</p><h3>{profile.targetRoleLabel || "还没有确定方向"}</h3><p>{profile.major || "可以在对话中补充你的背景"}</p></section>
        <section className="drawer-section"><Clock size={20}/><p className="drawer-label">每周可投入</p><h3>{profile.weeklyAvailableHours == null ? "尚未填写" : `${profile.weeklyAvailableHours} 小时`}</h3></section>
        {!profile.onboardingCompleted && <Link className="drawer-link" href="/onboarding">完善职业画像<ArrowUpRight size={16}/></Link>}
      </>}
      <Link className="drawer-link" href="/path">查看职业路径<ArrowUpRight size={16}/></Link>
      <Link className="drawer-link" href="/memory">审阅建议与成长证据<ArrowUpRight size={16}/></Link>
      <p className="drawer-assurance"><ShieldCheck size={18}/>AI 只能提出建议，重要变更由你确认后生效。</p>
    </div>
  </aside>;
}
