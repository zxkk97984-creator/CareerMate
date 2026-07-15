"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessagePart } from "@/lib/chat/persistence";
import { AlertCircle, UserCheck, Map, Compass, Link2 } from "lucide-react";
import { ProfileCandidateCard } from "./profile-candidate-card";
import { PlanSummaryCard } from "./plan-summary-card";
import { ExplorationReportCard } from "./exploration-report-card";
import { MemoryProposalCard } from "./memory-proposal-card";
import { QuickActions } from "./quick-actions";
import type { CareerPlanDto } from "@/lib/types";
import type { ExplorationReport } from "@/lib/careers/exploration-schema";
import { requireApiOk } from "@/lib/client-api";

interface MessagePartsProps {
  parts: ChatMessagePart[];
  onQuickAction?: (actionId: string, value: string) => void;
}

function CitationList({ items }: { items: ChatMessagePart & { type: "citations" } }) {
  return (
    <div className="parts-citation-list">
      <div className="parts-section-label">
        <Link2 size={14} />
        <span>参考来源</span>
      </div>
      <ul className="citation-items">
        {items.items.map((c, i) => (
          <li key={i} className="citation-item">
            <span className={`citation-label label-${c.label === "已核验职业库" ? "verified" : c.label === "实时联网调研" ? "live" : "inferred"}`}>
              {c.label}
            </span>
            {c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="citation-link">
                {c.title}
              </a>
            ) : (
              <span className="citation-title">{c.title}</span>
            )}
            <span className="citation-source">{c.source}</span>
            {c.accessedAt && <span className="citation-date">{c.accessedAt}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfileCandidateRef({ candidateId }: { candidateId: string }) {
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/profile/candidates")
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) {
          const items = (body.data as { items?: Array<{ id: string }> })?.items ?? [];
          const found = items.find((c) => c.id === candidateId);
          if (found) setCandidate(found as Record<string, unknown>);
        }
      })
      .catch(() => {});
  }, [candidateId]);

  if (!candidate) {
    return (
      <div className="parts-card parts-card-candidate">
        <UserCheck size={16} />
        <span>画像候选：{candidateId}</span>
        <span className="parts-card-hint">可在成长档案中查看和确认</span>
      </div>
    );
  }

  return (
    <ProfileCandidateCard
      candidate={{
        id: candidate.id as string,
        field: candidate.field as string,
        oldValue: candidate.oldValue as unknown,
        newValue: candidate.newValue as unknown,
        confidence: candidate.confidence as number,
        reason: candidate.reason as string,
        status: candidate.status as string,
        evidenceExcerpt: candidate.evidenceExcerpt as string,
        impactSummary: candidate.impactSummary as string,
      }}
      onAction={async (id, action, newValue) => {
        const response = await fetch("/api/profile/candidates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId: id,
            action,
            ...(newValue !== undefined ? { newValue } : {}),
          }),
        });
        await requireApiOk(response);
      }}
    />
  );
}

function PlanRef({ planId, version }: { planId: string; version: number }) {
  const [plan, setPlan] = useState<CareerPlanDto | null>(null);
  const [generationError, setGenerationError] = useState("");
  const generationStarted = useRef(false);

  useEffect(() => {
    if (planId === "__generating__") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const data = await requireApiOk<{ plan: CareerPlanDto }>(
          await fetch(`/api/plans/${encodeURIComponent(planId)}`),
        );
        if (!active) return;
        setPlan(data.plan);
        if (["generating", "processing"].includes(data.plan.status)) {
          timer = setTimeout(poll, 2_000);
        }
      } catch (caught) {
        if (active) {
          setGenerationError(caught instanceof Error ? caught.message : "计划状态读取失败");
        }
      }
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [planId]);

  useEffect(() => {
    if (planId === "__generating__" || plan?.status !== "generating" || generationStarted.current) return;
    generationStarted.current = true;
    void fetch(`/api/plans/${encodeURIComponent(planId)}/generate`, { method: "POST" })
      .then((response) => requireApiOk<{ plan: CareerPlanDto }>(response))
      .then((data) => {
        setPlan(data.plan);
        setGenerationError("");
      })
      .catch((caught) => {
        setGenerationError(caught instanceof Error ? caught.message : "计划生成失败，可以重试");
      });
  }, [plan?.status, planId]);

  async function retryGeneration() {
    setGenerationError("");
    const data = await requireApiOk<{ plan: CareerPlanDto }>(
      await fetch(`/api/plans/${encodeURIComponent(planId)}/generate`, { method: "POST" }),
    );
    generationStarted.current = true;
    setPlan(data.plan);
  }

  // 兼容已持久化的旧占位符；新消息不应继续写入该值。
  if (planId === "__generating__") {
    return (
      <div className="parts-card parts-card-plan">
        <Map size={16} />
        <span>旧版计划生成任务无法恢复</span>
        <span className="parts-card-hint">
          请重新发起计划生成，或前往「<a href="/path" className="inline-link">职业路径</a>」查看已有计划。
        </span>
      </div>
    );
  }

  if (plan && ["generating", "processing"].includes(plan.status)) {
    return (
      <div className="parts-card parts-card-plan parts-card-generating" role="status">
        <Map size={16} />
        <span>{plan.status === "processing" ? "百宝箱正在生成学习计划…" : "学习计划已进入生成队列…"}</span>
        <span className="parts-card-hint">任务已保存，刷新页面后仍会继续显示真实状态。</span>
        {generationError ? <button className="inline-link" onClick={() => void retryGeneration().catch((caught) => {
          setGenerationError(caught instanceof Error ? caught.message : "计划重试失败");
        })}>重新连接</button> : null}
        {generationError ? <span className="parts-card-hint text-red-600">{generationError}</span> : null}
      </div>
    );
  }

  if (plan?.status === "generation_failed") {
    return (
      <div className="parts-card parts-card-plan" role="alert">
        <Map size={16} />
        <span>学习计划生成失败</span>
        <span className="parts-card-hint">任务记录已保留，可以安全重试。</span>
        <button className="inline-link" onClick={() => void retryGeneration().catch((caught) => {
          setGenerationError(caught instanceof Error ? caught.message : "计划重试失败");
        })}>重试生成</button>
        {generationError ? <span className="parts-card-hint text-red-600">{generationError}</span> : null}
      </div>
    );
  }

  if (plan) {
    return (
      <PlanSummaryCard
        plan={plan}
        diff={plan.status === "pending"
          ? { directionChange: false, addedTasks: [], removedTasks: [] }
          : null}
        onAcceptReplan={async (id) => {
          const response = await fetch(`/api/plans/${encodeURIComponent(id)}/accept-replan`, {
            method: "POST",
          });
          await requireApiOk(response);
          setPlan((current) => current ? { ...current, status: "active" } : current);
        }}
        onViewPlan={() => { window.location.href = "/path"; }}
      />
    );
  }

  return (
    <div className="parts-card parts-card-plan">
      <Map size={16} />
      <span>职业计划 v{version}</span>
      <span className="parts-card-hint">可在职业路径页面查看完整计划</span>
    </div>
  );
}

type ReportCardData = ExplorationReport & { id: string; status: string };

function ExplorationReportRef({ reportId }: { reportId: string }) {
  const [data, setData] = useState<{
    report: ReportCardData;
    sourceLabel: "精品职业资料" | "实时联网调研" | "AI分析与推断";
  } | null>(null);

  useEffect(() => {
    fetch(`/api/careers/explorations/${encodeURIComponent(reportId)}`)
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) setData(body.data);
      })
      .catch(() => {});
  }, [reportId]);

  if (data) {
    return (
      <ExplorationReportCard
        report={data.report}
        sourceLabel={data.sourceLabel}
        onSubmit={async (id) => {
          const response = await fetch(
            `/api/careers/explorations/${encodeURIComponent(id)}/submit`,
            { method: "POST" },
          );
          await requireApiOk(response);
          setData((current) => current
            ? { ...current, report: { ...current.report, status: "submitted" } }
            : current);
        }}
      />
    );
  }

  return (
    <div className="parts-card parts-card-report">
      <Compass size={16} />
      <span>职业探索报告</span>
      <span className="parts-card-hint">可在资源中心查看完整报告</span>
    </div>
  );
}

function MemoryRef({ memoryId }: { memoryId: string }) {
  const [data, setData] = useState<{ id: string; content: string; kind: string; sensitivity: string; status: string } | null>(null);

  useEffect(() => {
    fetch(`/api/memory/${encodeURIComponent(memoryId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) setData(body.data ?? body);
      })
      .catch(() => {});
  }, [memoryId]);

  if (!data || data.status !== "pending") return null;

  return (
    <MemoryProposalCard
      memoryId={data.id}
      content={data.content}
      kind={data.kind as "career_fact" | "preference" | "constraint" | "goal"}
      sensitivity={data.sensitivity as "normal" | "sensitive"}
      status="pending"
      onAccept={async (id) => {
        await fetch(`/api/memory/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
        setData((c) => c ? { ...c, status: "confirmed" } : c);
      }}
      onReject={async (id) => {
        await fetch(`/api/memory/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        });
        setData((c) => c ? { ...c, status: "rejected" } : c);
      }}
      onEdit={async (id, newContent) => {
        await fetch(`/api/memory/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", content: newContent }),
        });
      }}
    />
  );
}

function ErrorPart({ code, message }: { code: string; message: string }) {
  return (
    <div className="parts-error">
      <AlertCircle size={16} />
      <span>{message}</span>
      <code className="parts-error-code">{code}</code>
    </div>
  );
}

export function MessageParts({ parts, onQuickAction }: MessagePartsProps) {
  if (!parts || parts.length === 0) return null;

  return (
    <div className="message-parts">
      {parts.map((part, index) => {
        switch (part.type) {
          case "citations":
            return <CitationList key={index} items={part as ChatMessagePart & { type: "citations" }} />;
          case "profile_candidate_ref":
            return <ProfileCandidateRef key={index} candidateId={(part as ChatMessagePart & { type: "profile_candidate_ref" }).candidateId} />;
          case "plan_ref": {
            const p = part as ChatMessagePart & { type: "plan_ref" };
            return <PlanRef key={index} planId={p.planId} version={p.version} />;
          }
          case "exploration_report_ref":
            return <ExplorationReportRef key={index} reportId={(part as ChatMessagePart & { type: "exploration_report_ref" }).reportId} />;
          case "error": {
            const e = part as ChatMessagePart & { type: "error" };
            return <ErrorPart key={index} code={e.code} message={e.message} />;
          }
          case "memory_ref": {
            const m = part as ChatMessagePart & { type: "memory_ref" };
            return <MemoryRef key={index} memoryId={m.memoryId} />;
          }
          case "quick_actions": {
            const q = part as ChatMessagePart & { type: "quick_actions" };
            return (
              <QuickActions
                key={index}
                questionId={q.questionId}
                actions={q.actions}
                status={q.status}
                onSelect={(actionId, value) => onQuickAction?.(actionId, value)}
              />
            );
          }
          case "text":
            // text 部件已在 message-text 中渲染，这里不重复
            return null;
          default:
            return null;
        }
      })}
    </div>
  );
}
