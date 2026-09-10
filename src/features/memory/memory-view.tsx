"use client";

/** 成长档案 —— 待确认建议 / 画像与证据 / 长期记忆 三标签（T18） */
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

const KIND_LABELS: Record<string, string> = {
  career_fact: "职业事实",
  preference: "偏好",
  constraint: "约束",
  goal: "目标",
};

function CandidateDataPreview({ candidateType, data }: { candidateType: string; data: unknown }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <p className="memory-candidate-note">候选没有可展示的数据。</p>;
  }
  const record = data as Record<string, unknown>;

  if (candidateType === "memory_item") {
    return (
      <dl className="memory-candidate-list">
        <div><dt>记忆内容</dt><dd>{String(record.content ?? "")}</dd></div>
        <div><dt>类型</dt><dd>{KIND_LABELS[String(record.kind)] ?? String(record.kind ?? "职业事实")}</dd></div>
        <div><dt>原因</dt><dd>{String(record.reason ?? "未提供")}</dd></div>
        <div><dt>敏感级别</dt><dd>{record.sensitivity === "sensitive" ? "敏感" : "普通"}</dd></div>
      </dl>
    );
  }

  if (candidateType === "profile_patch" && record.patch && typeof record.patch === "object") {
    return (
      <ul className="memory-candidate-list">
        {Object.entries(record.patch as Record<string, unknown>).map(([key, value]) => (
          <li key={key}><strong>{key}</strong>：{formatCandidateValue(value)}</li>
        ))}
      </ul>
    );
  }

  if (candidateType === "ability_evidence" && Array.isArray(record.abilityEvidence)) {
    return (
      <ul className="memory-candidate-list">
        {record.abilityEvidence.map((item, index) => {
          const evidence = item as Record<string, unknown>;
          return <li key={index}><strong>{abilityLabels[evidence.abilityKey as keyof typeof abilityLabels] ?? String(evidence.abilityKey)}</strong>：{String(evidence.summary ?? "")}</li>;
        })}
      </ul>
    );
  }

  if (candidateType === "career_plan" || candidateType === "growth_replan") {
    const plan = record.plan as Record<string, unknown> | undefined;
    const phases = Array.isArray(plan?.phases) ? plan!.phases as Array<Record<string, unknown>> : [];
    return (
      <div className="memory-candidate-list">
        <p><strong>{String(plan?.title ?? "职业计划")}</strong> · {String((plan?.targetRole as Record<string, unknown> | undefined)?.label ?? "")}</p>
        {phases.map((phase, index) => (
          <div key={index} className="memory-candidate-phase">
            <strong>{String(phase.title ?? `阶段 ${index + 1}`)}</strong>
            <span>{String(phase.objective ?? "")}</span>
            <ul>{(Array.isArray(phase.actions) ? phase.actions as Array<Record<string, unknown>> : []).map((action, actionIndex) => <li key={actionIndex}>{String(action.title ?? "")} · {action.estimatedHours != null ? `${action.estimatedHours} 小时` : "投入待细化"}</li>)}</ul>
          </div>
        ))}
      </div>
    );
  }

  if (candidateType === "learning_route") {
    const stages = Array.isArray(record.stages) ? record.stages as Array<Record<string, unknown>> : [];
    return (
      <div className="memory-candidate-list">
        <p><strong>{String(record.targetRole ?? "学习路线")}</strong> · {String(record.period ?? "")}</p>
        {stages.map((stage, index) => <div key={index}><strong>{String(stage.title ?? `阶段 ${index + 1}`)}</strong><p>{String(stage.description ?? "")}</p></div>)}
      </div>
    );
  }

  return <pre className="memory-candidate-json">{JSON.stringify(record, null, 2)}</pre>;
}

function V2CandidateCard({
  candidate,
  index,
  busy,
  onDecide,
}: {
  candidate: V2CandidateDto;
  index: number;
  busy: boolean;
  onDecide: (decision: "accept" | "reject") => void;
}) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggleDetail() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return;
    setLoading(true);
    const response = await fetchApi<{ artifact?: Record<string, unknown>; status?: string }>(`/api/agentic-v2/candidates/${candidate.id}`);
    setLoading(false);
    if (response.ok) setDetail(response.data.artifact ?? null);
  }

  const artifact = detail?.artifact as Record<string, unknown> | undefined;
  const typeLabel = candidate.candidateType === "profile_patch" ? "画像更新"
    : candidate.candidateType === "profile_assessment" ? "综合评估"
      : candidate.candidateType === "ability_evidence" ? "能力证据"
        : candidate.candidateType === "career_plan" ? "职业规划"
          : candidate.candidateType === "learning_route" ? "学习路线"
            : candidate.candidateType === "growth_replan" ? "成长复盘"
              : candidate.candidateType === "memory_item" ? "长期记忆"
                : candidate.candidateType === "career_template_draft" ? "岗位草稿"
                  : candidate.candidateType;

  return (
    <div className="memory-card" style={{ animationDelay: `${Math.min(index, 3) * 0.05}s` }}>
      <div className="memory-candidate-head">
        <div>
          <strong>{typeLabel}</strong>
          <span>创建于 {new Date(candidate.createdAt).toLocaleDateString("zh-CN")}</span>
        </div>
        <span className={`cm-dot-tag ${candidate.status === "accepted" ? "cm-dot-tag-success" : candidate.status === "pending" ? "cm-dot-tag-warning" : "cm-dot-tag-neutral"}`}>
          {candidate.status === "pending" ? "待确认" : candidate.status === "accepted" ? "已确认" : candidate.status === "rejected" ? "已拒绝" : candidate.status}
        </span>
      </div>
      {candidate.impactSummary ? <p className="memory-candidate-summary">{candidate.impactSummary}</p> : null}
      <div className="memory-candidate-actions">
        <Button variant="secondary" disabled={candidate.status !== "pending" || busy} onClick={onDecide.bind(null, "accept")}>确认</Button>
        <Button variant="ghost" disabled={candidate.status !== "pending" || busy} onClick={onDecide.bind(null, "reject")}>拒绝</Button>
        <Button variant="ghost" disabled={loading} onClick={() => void toggleDetail()}>{expanded ? "收起详情" : loading ? "加载中..." : "查看完整变化"}</Button>
      </div>
      {expanded ? (
        <div className="memory-candidate-detail">
          {loading ? <p>正在读取候选内容...</p> : artifact ? <CandidateDataPreview candidateType={candidate.candidateType} data={artifact.data} /> : <p>候选详情暂时不可用。</p>}
        </div>
      ) : null}
    </div>
  );
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
    setNotice(r.data.enabled
      ? "本地长期记忆已开启；平台自动记忆仍需在百宝箱控制台单独管理。"
      : "本地长期记忆已关闭；已有本地记忆保留，相关会话上下文已失效。平台自动记忆不受本地开关控制。");
    await refresh();
  }

  function renderMemoryCard(memory: MemoryItemDto, index: number) {
    return (
      <div key={memory.id} className="memory-card" style={{ animationDelay: `${Math.min(index, 3) * 0.05}s` }}>
        {editingId === memory.id ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              aria-label="编辑记忆内容"
              className="cm-input-textarea"
              style={{ minHeight: 80 }}
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => saveEdit(memory)}>保存</Button>
              <Button variant="secondary" onClick={cancelEdit}>取消</Button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--cm-text-strong)" }}>{memory.content}</p>
            <div className="memory-item-meta">
              <span className="cm-dot-tag cm-dot-tag-neutral">{KIND_LABELS[memory.kind] ?? memory.kind}</span>
              <span>{memory.source === "manual" ? "手动添加" : memory.source === "agent" ? "AI 候选确认" : memory.source}</span>
              {memory.confidence != null ? <span>置信度 {Math.round(memory.confidence * 100)}%</span> : null}
              {memory.sensitivity === "sensitive" ? <span className="sensitive-tag">敏感</span> : null}
            </div>
            {memory.reason ? <p className="memory-item-reason">{memory.reason}</p> : null}
            <div className="memory-item-actions">
              <Button variant="secondary" onClick={() => startEdit(memory)}>编辑</Button>
              <Button variant="danger" onClick={() => setDeleteTarget(memory)}>删除</Button>
            </div>
          </>
        )}
      </div>
    );
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
  const pendingMemories = memories.filter((memory) => memory.status !== "confirmed");
  const confirmedMemories = memories.filter((memory) => memory.status === "confirmed");
  const preferenceMemories = confirmedMemories.filter((memory) => memory.kind === "preference");
  const factMemories = confirmedMemories.filter((memory) => memory.kind !== "preference");

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

            {v2Candidates.map((candidate, index) => (
              <V2CandidateCard
                key={candidate.id}
                candidate={candidate}
                index={index + candidates.length}
                busy={decisionBusy === candidate.id}
                onDecide={(decision) => void operateV2(candidate.id, decision)}
              />
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

      {activeTab === "memory" && (
        <div className="memory-stack">
          <SurfaceCard
            title="长期记忆"
            description="仅控制 CareerMate 本地记忆；不会同步关闭百宝箱平台自动长期记忆。"
            action={<MemorySwitch checked={memoryEnabled} onChange={toggleMemory} />}
          >
            <div className="memory-scope-note">
              <strong>{memoryEnabled ? "本地记忆已开启" : "本地记忆已关闭"}</strong>
              <p>{memoryEnabled
                ? "AI 只有在候选确认或你手动添加后，才会把内容写入本地长期记忆。"
                : "不再写入新的本地记忆；已有记忆保留，相关会话上下文已失效并会重新构建。"}
              </p>
              <p>平台自动记忆是另一套机制，本地开关不能代替平台关闭、删除或隔离操作。</p>
            </div>
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

            {memories.length === 0 ? (
              <p style={{ margin: 0, padding: "10px 2px", fontSize: 13.5, color: "var(--cm-text-muted)" }}>还没有长期记忆。</p>
            ) : (
              <div className="memory-groups">
                {pendingMemories.length > 0 ? (
                  <section>
                    <h3>待确认记忆</h3>
                    <div className="memory-list">{pendingMemories.map(renderMemoryCard)}</div>
                  </section>
                ) : null}
                <section>
                  <h3>偏好记忆</h3>
                  {preferenceMemories.length > 0
                    ? <div className="memory-list">{preferenceMemories.map((memory, index) => renderMemoryCard(memory, index))}</div>
                    : <p className="memory-empty-section">还没有已确认的偏好记忆。</p>}
                </section>
                <section>
                  <h3>事实与其他记忆</h3>
                  {factMemories.length > 0
                    ? <div className="memory-list">{factMemories.map((memory, index) => renderMemoryCard(memory, index))}</div>
                    : <p className="memory-empty-section">还没有已确认的事实或其他记忆。</p>}
                </section>
              </div>
            )}
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
