"use client";

/** 成长档案 —— 待确认建议 / 画像与证据 / 记忆与隐私 三标签（T18） */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchApi } from "@/lib/client-api";
import { abilityLabels, abilityKeys, type ProfileDto } from "@/lib/types";
import { memoryTabs, resolveMemoryTab, type MemoryTab } from "@/lib/memory-tabs";
import type { MemoryItemDto, V2CandidateDto } from "@/lib/workspace-types";
import type { CandidateDto } from "@/lib/types";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** 把决策接口的失败归一化为用户可读提示；409 提示需重生成，404 提示已不存在。 */
function decisionMessage(status: number, code: string, fallback: string): string {
  if (status === 409 || code === "CONFLICT") return "资料已变化，这条建议需要重新生成";
  if (status === 404) return "这条建议已不存在";
  if (status === 401) return "登录已过期，请重新登录后再试";
  return fallback;
}

/** 候选值的可读展示：数组/对象来自后端 JSON 字段，这里转成文本（空值显示“未设置”）。 */
function formatCandidateValue(value: unknown): string {
  if (value === null || value === undefined) return "未设置";
  if (Array.isArray(value)) return value.map((v) => String(v)).join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* ── 标签页 ── */
/* 标签定义与解析在 src/lib/memory-tabs.ts（含深链接回退），此处复用 */

/* ── 主视图 ── */

interface MemoryViewProps {
  memories: MemoryItemDto[];
  candidates: CandidateDto[];
  v2Candidates?: V2CandidateDto[];
  profile: ProfileDto | null;
  memoryEnabled: boolean;
  refresh: () => Promise<void>;
  setNotice: (v: string) => void;
}

/** 长期记忆开关（40×24 轨道，含文字） */
function MemorySwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="cm-switch"
    >
      <span className="cm-switch-track" aria-hidden="true"><span className="cm-switch-thumb" /></span>
      {checked ? "长期记忆已开启" : "长期记忆已关闭"}
    </button>
  );
}

export function MemoryView({ memories, candidates, v2Candidates = [], profile, memoryEnabled, refresh, setNotice }: MemoryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [content, setContent] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");

  // 内联编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  // 删除确认目标
  const [deleteTarget, setDeleteTarget] = useState<MemoryItemDto | null>(null);
  // 候选决策进行中（避免双击重复写入；成功后被处理卡片进入终态）
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);

  // 深链接标签：刷新/浏览器返回仍能定位（T18）
  const activeTab: MemoryTab = resolveMemoryTab(searchParams.get("tab"));

  function setTab(tab: MemoryTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/memory?${params.toString()}`);
  }

  /** V1 画像候选决策：检查 r.ok，失败按 status/code 归一化提示，成功才更新状态。 */
  async function operate(candidateId: string, action: "accept" | "reject") {
    if (decisionBusy) return;
    setDecisionBusy(candidateId);
    const r = await fetchApi("/api/profile/candidates", {
      method: "PATCH",
      body: JSON.stringify({ candidateId, action }),
    });
    if (!r.ok) {
      setNotice(decisionMessage(r.status, r.error.code, `画像更新${action === "accept" ? "确认" : "拒绝"}失败，请稍后重试`));
      setDecisionBusy(null);
      return;
    }
    setNotice(action === "accept" ? "画像更新已确认。" : "画像更新已拒绝。");
    setDecisionBusy(null);
    await refresh();
  }

  /** V2 候选决策：POST decision，检查 ok，成功才提示并刷新。 */
  async function operateV2(candidateId: string, decision: "accept" | "reject") {
    if (decisionBusy) return;
    setDecisionBusy(candidateId);
    const r = await fetchApi(`/api/agentic-v2/candidates/${candidateId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    if (!r.ok) {
      setNotice(decisionMessage(r.status, r.error.code, decision === "accept" ? "确认失败，请稍后重试" : "拒绝失败，请稍后重试"));
      setDecisionBusy(null);
      return;
    }
    setNotice(decision === "accept" ? "已确认候选" : "已拒绝候选");
    setDecisionBusy(null);
    await refresh();
  }

  async function createMemory() {
    const r = await fetchApi<{ memory: any }>("/api/memories", { method: "POST", body: JSON.stringify({ content, sensitivity: "normal" }) });
    if (!r.ok) return setNotice(r.error?.message ?? "记忆创建失败。");
    setContent("");
    setNotice("记忆已创建。");
    await refresh();
  }

  /** 开始编辑记忆（内联） */
  function startEdit(memory: any) {
    setEditingId(memory.id);
    setEditContent(memory.content);
  }

  /** 取消编辑 */
  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  /** 保存编辑 */
  async function saveEdit(memory: any) {
    const next = editContent.trim();
    if (!next || next === memory.content) { cancelEdit(); return; }
    const r = await fetchApi(`/api/memory/${memory.id}`, { method: "PATCH", body: JSON.stringify({ content: next }) });
    if (!r.ok) { setNotice(r.error?.message ?? "记忆编辑失败。"); return; }
    cancelEdit();
    setNotice("记忆已更新。");
    await refresh();
  }

  /** 确认删除记忆：判断响应成功，成功返回 true（关闭弹窗），失败返回 false（保留弹窗，T18） */
  async function confirmDelete(): Promise<boolean> {
    if (!deleteTarget) return false;
    const r = await fetchApi(`/api/memory/${deleteTarget.id}`, { method: "DELETE" });
    if (!r.ok) {
      setNotice(decisionMessage(r.status, r.error.code, "记忆删除失败，请稍后重试"));
      return false;
    }
    setDeleteTarget(null);
    setNotice("记忆已删除。");
    await refresh();
    return true;
  }

  async function toggleMemory() {
    const r = await fetchApi<{ enabled: boolean }>("/api/memory/toggle", { method: "POST", body: JSON.stringify({ enabled: !memoryEnabled }) });
    if (!r.ok) return setNotice(r.error?.message ?? "记忆开关保存失败。");
    // 文案与实际语义一致：关闭=不再写入新的长期记忆（已有记忆仍被保留）
    setNotice(r.data.enabled ? "长期记忆已开启，AI 会继续提炼并保存事实、偏好与目标。" : "长期记忆已关闭，AI 不再写入新的长期记忆；已有记忆仍被保留。");
    await refresh();
  }

  async function exportData() {
    const r = await fetchApi<Record<string, unknown>>("/api/privacy/export");
    if (!r.ok) return setNotice(r.error?.message ?? "数据导出失败。");
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "careermate-data.json"; a.click(); URL.revokeObjectURL(url);
    setNotice("账号成长数据已导出，敏感凭据未包含在文件中。");
  }

  async function clearData(): Promise<boolean> {
    const r = await fetchApi<{ cleared: boolean }>("/api/privacy/account-data", { method: "DELETE", body: JSON.stringify({ confirmation: clearConfirmation }) });
    if (!r.ok) {
      setNotice(r.error?.message ?? "成长数据清空失败。");
      return false;
    }
    setClearConfirmation("");
    setNotice("成长数据已清空，正在跳转画像引导...");
    router.push("/onboarding");
    router.refresh();
    return true;
  }

  // 画像基础信息 + 能力（只读，不直接编辑分数；T18）
  const profileBasics = profile ? [
    { label: "目标岗位", value: profile.targetRoleLabel ?? profile.targetRole ?? "未设置" },
    { label: "专业", value: profile.major || "未填写" },
    { label: "教育阶段", value: profile.educationStage || "未填写" },
    { label: "每周可投入", value: profile.weeklyAvailableHours != null ? `${profile.weeklyAvailableHours} 小时` : "未设置" },
    { label: "偏好", value: profile.learningPreference?.length ? profile.learningPreference.join("、") : "未设置" },
  ] : [];
  const abilityScoreEntries = useMemo(() =>
    abilityKeys.map((key) => ({ key, label: abilityLabels[key], value: profile?.abilityScores?.[key] ?? null })),
    [profile],
  );

  return (
    <div className="memory-tabbed" data-od-id="memory-layout">
      {/* 标签导航 */}
      <div className="memory-tabs" role="tablist" aria-label="成长档案">
        {memoryTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`memory-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "candidates" && (
        <SurfaceCard title="待确认建议" description="确认后才会写入正式画像">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {candidates.length === 0 && v2Candidates.length === 0 && (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--cm-text-muted)" }}>暂无待确认的画像更新。AI 提出更新时，会先在这里等你确认。</p>
            )}
            {candidates.map((c, i) => (
              <div key={c.id} className="memory-card" style={{ animationDelay: `${Math.min(i, 3) * 0.05}s` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>{c.field}</div>
                  {c.status !== "pending" ? (
                    <span className={`cm-dot-tag ${c.status === "accepted" ? "cm-dot-tag-success" : "cm-dot-tag-neutral"}`}>
                      {c.status === "accepted" ? "已确认" : c.status === "rejected" ? "已拒绝" : c.status}
                    </span>
                  ) : null}
                </div>
                {/* 确认前必看的“当前值 → 建议值”，不可盲确认（F04） */}
                {c.status === "pending" && (
                  <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>
                    <span style={{ textDecoration: "line-through", opacity: 0.8 }}>{formatCandidateValue(c.oldValue)}</span>
                    <span> → </span>
                    <span style={{ fontWeight: 600, color: "var(--cm-text-strong)" }}>{formatCandidateValue(c.newValue)}</span>
                  </div>
                )}
                <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "var(--cm-text-muted)" }}>{c.reason}</p>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <Button variant="secondary" disabled={c.status !== "pending" || decisionBusy === c.id} onClick={() => operate(c.id, "accept")}>确认</Button>
                  <Button variant="ghost" disabled={c.status !== "pending" || decisionBusy === c.id} onClick={() => operate(c.id, "reject")}>拒绝</Button>
                </div>
              </div>
            ))}

            {v2Candidates.map((c: V2CandidateDto, i: number) => (
              <div key={c.id} className="memory-card" style={{ animationDelay: `${Math.min(i + candidates.length, 3) * 0.05}s` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cm-text-strong)" }}>
                    {c.candidateType === "profile_patch" ? "画像更新"
                      : c.candidateType === "profile_assessment" ? "综合评估"
                      : c.candidateType === "ability_evidence" ? "能力证据"
                      : c.candidateType === "career_plan" ? "职业规划"
                      : c.candidateType === "learning_route" ? "学习路线"
                      : c.candidateType === "growth_replan" ? "成长复盘"
                      : c.candidateType === "memory_item" ? "长期记忆"
                      : c.candidateType === "career_template_draft" ? "岗位草稿"
                      : c.candidateType}
                  </div>
                  {c.status !== "pending" ? (
                    <span className={`cm-dot-tag ${c.status === "accepted" ? "cm-dot-tag-success" : "cm-dot-tag-neutral"}`}>
                      {c.status === "accepted" ? "已确认" : c.status === "rejected" ? "已拒绝" : c.status}
                    </span>
                  ) : null}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>
                  创建于 {new Date(c.createdAt).toLocaleDateString("zh-CN")} · 状态：{c.status === "pending" ? "待确认" : c.status === "accepted" ? "已接受" : c.status === "rejected" ? "已拒绝" : c.status}
                </p>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <Button variant="secondary" disabled={c.status !== "pending" || decisionBusy === c.id} onClick={() => operateV2(c.id, "accept")}>确认</Button>
                  <Button variant="ghost" disabled={c.status !== "pending" || decisionBusy === c.id} onClick={() => operateV2(c.id, "reject")}>拒绝</Button>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {activeTab === "profile" && (
        <SurfaceCard title="画像与证据" description="当前画像基础信息与能力记录（只读，不直接编辑分数）">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="memory-profile-grid">
              {profileBasics.map((row) => (
                <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--cm-text-subtle)" }}>{row.label}</span>
                  <span style={{ fontSize: 14, color: "var(--cm-text-strong)" }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid var(--cm-border)", paddingTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-text-strong)", marginBottom: 10 }}>能力记录</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {abilityScoreEntries.map((entry) => (
                  <div key={entry.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                    <span style={{ color: "var(--cm-text-strong)" }}>{entry.label}</span>
                    <span style={{ color: "var(--cm-text-muted)" }}>{entry.value != null ? `${entry.value} / 100` : "未评估"}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--cm-text-subtle)" }}>如需更新能力或画像，请通过右上角“待确认建议”里的候选流程，确认后才写入正式画像。</p>
            </div>
          </div>
        </SurfaceCard>
      )}

      {activeTab === "privacy" && (
        <div className="memory-stack">
          <SurfaceCard
            title="长期记忆"
            description={memoryEnabled ? "AI 会从对话中提炼并长期保存的事实、偏好与目标" : "关闭后 AI 不再写入新的长期记忆（已有记忆仍被保留）"}
            action={<MemorySwitch checked={memoryEnabled} onChange={toggleMemory} />}
          >
            <div style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                aria-label="新记忆"
                className="cm-input"
                disabled={!memoryEnabled}
                placeholder={memoryEnabled ? "添加一条长期记忆…" : "长期记忆已关闭"}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && memoryEnabled && content.trim()) void createMemory();
                }}
              />
              <Button disabled={!memoryEnabled || !content.trim()} onClick={createMemory}>创建</Button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {memories.length === 0 && (
                <p style={{ margin: 0, padding: "10px 2px", fontSize: 13.5, color: "var(--cm-text-muted)" }}>还没有长期记忆。</p>
              )}
              {memories.map((m, i) => (
                <div key={m.id} className="memory-card" style={{ animationDelay: `${Math.min(i, 3) * 0.05}s` }}>
                  {editingId === m.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <textarea
                        aria-label="编辑记忆内容"
                        className="cm-input-textarea"
                        style={{ minHeight: 80 }}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button onClick={() => saveEdit(m)}>保存</Button>
                        <Button variant="secondary" onClick={cancelEdit}>取消</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--cm-text-strong)" }}>{m.content}</p>
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span>
                          {m.sensitivity === "sensitive" ? <span className="sensitive-tag">敏感</span> : <span className="cm-dot-tag cm-dot-tag-neutral">普通</span>}
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button variant="secondary" onClick={() => startEdit(m)}>编辑</Button>
                          <Button variant="danger" onClick={() => setDeleteTarget(m)}>删除</Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard title="隐私与数据" description="导出与清空，数据完全由你掌控">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-text-strong)" }}>导出 JSON</div>
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--cm-text-subtle)" }}>下载全部成长数据，敏感凭据不会包含在内</p>
                </div>
                <Button variant="secondary" onClick={exportData}>导出</Button>
              </div>

              {/* 清空成长数据：独立危险区域，不与候选确认操作挨在一起（T18） */}
              <div style={{ borderTop: "1px solid var(--cm-border)", paddingTop: 14, background: "var(--cm-danger-bg)", borderRadius: "var(--cm-radius-control)", padding: "16px" }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-danger)" }}>清空成长数据</div>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>
                  清空会删除画像成长数据并重新进入引导，但保留账号、角色和当前登录态。请输入确认词{" "}
                  <code style={{ background: "var(--cm-danger-bg)", color: "var(--cm-danger)", padding: "2px 6px", borderRadius: 4 }}>CLEAR_MY_DATA</code>。
                </p>
                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <input
                    aria-label="清空确认词"
                    className="cm-input"
                    placeholder="输入确认词以启用"
                    value={clearConfirmation}
                    onChange={(e) => setClearConfirmation(e.target.value)}
                  />
                  <Button
                    variant="danger"
                    disabled={clearConfirmation !== "CLEAR_MY_DATA"}
                    onClick={clearData}
                    style={{ flexShrink: 0 }}
                  >
                    清空成长数据
                  </Button>
                </div>
              </div>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* 删除确认弹窗：异步确认成功才关闭，失败保留弹窗（T18） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="删除记忆"
        description={deleteTarget ? <>确定要删除记忆：<strong>{deleteTarget.content?.slice(0, 60)}{(deleteTarget.content?.length ?? 0) > 60 ? "…" : ""}</strong>？此操作不可撤销。</> : null}
        confirmLabel="确认删除"
        danger
      />
    </div>
  );
}
