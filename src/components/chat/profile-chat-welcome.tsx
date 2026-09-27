"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { fetchApi } from "@/lib/client-api";
import type { ProfileDto } from "@/lib/types";
import type { ActiveOnboardingConversation } from "@/lib/onboarding-resume";

export function ProfileChatWelcome({ onChoose }: { onChoose: (text: string) => void }) {
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    void fetchApi<{ profile: ProfileDto; activeOnboardingConversation: ActiveOnboardingConversation | null }>("/api/me").then((response) => {
      if (!active) return;
      if (!response.ok) { setError(response.error.message); return; }
      setProfile(response.data.profile);
      setHasDraft(Boolean(response.data.activeOnboardingConversation));
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <section className="profile-chat-welcome" aria-label="在对话中完善画像">
      <span className="profile-chat-icon" aria-hidden="true"><UserRound size={24} /></span>
      <h1>聊聊你，让建议更适合你。</h1>
      <p>直接告诉我你的背景、职业目标，或最近的变化。需要确认的画像更新会出现在对话中。</p>
      <div className="profile-saved-context">
        <h2>当前已保存的画像</h2>
        {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>重新读取</button></p> : !profile ? <p role="status">正在读取画像…</p> : (
          <dl>
            <div><dt>专业 / 背景</dt><dd>{profile.major || "待补充"}</dd></div>
            <div><dt>目标岗位</dt><dd>{profile.targetRoleLabel || "待补充"}</dd></div>
            <div><dt>每周投入</dt><dd>{profile.weeklyAvailableHours == null ? "待补充" : `${profile.weeklyAvailableHours} 小时`}</dd></div>
          </dl>
        )}
      </div>
      <div className="profile-chat-prompts" aria-label="画像对话示例">
        {[
          ["补充我的经历", "我想补充我的学习或工作经历，请帮我整理可以更新到个人画像的信息。"],
          ["调整职业目标", "我想调整职业目标，请先和我聊聊变化的原因，再提出画像更新建议。"],
          ["修改可用时间", "我每周可投入的学习时间有变化，请帮我更新个人画像。"],
        ].map(([label, prompt]) => <button type="button" key={label} onClick={() => onChoose(prompt)}>{label}<ArrowRight size={14} /></button>)}
      </div>
      {hasDraft && <p className="profile-resume-note">还有一份未确认的引导草稿。<Link href="/chat?intent=onboarding">继续整理草稿 <ArrowRight size={13} /></Link></p>}
      <p className="profile-chat-note">已有信息不用重新填写。你也可以直接聊其他话题。</p>
    </section>
  );
}
