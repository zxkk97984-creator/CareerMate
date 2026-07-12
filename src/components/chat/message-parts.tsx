"use client";

import { useEffect, useState } from "react";
import type { ChatMessagePart } from "@/lib/chat/persistence";
import { AlertCircle, UserCheck, Map, Compass, Link2 } from "lucide-react";
import { ProfileCandidateCard } from "./profile-candidate-card";
import { PlanSummaryCard } from "./plan-summary-card";
import { ExplorationReportCard } from "./exploration-report-card";
import type { CareerPlanDto } from "@/lib/types";
import type { ExplorationReport } from "@/lib/careers/exploration-schema";

interface MessagePartsProps {
  parts: ChatMessagePart[];
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
        await fetch("/api/profile/candidates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId: id,
            action,
            ...(newValue !== undefined ? { newValue } : {}),
          }),
        });
      }}
    />
  );
}

function PlanRef({ planId, version }: { planId: string; version: number }) {
  const [plan, setPlan] = useState<CareerPlanDto | null>(null);

  useEffect(() => {
    fetch(`/api/plans/${encodeURIComponent(planId)}`)
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) setPlan(body.data.plan as CareerPlanDto);
      })
      .catch(() => {});
  }, [planId]);

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
          if (!response.ok) throw new Error("计划确认失败");
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
          if (!response.ok) throw new Error("报告提交失败");
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

function ErrorPart({ code, message }: { code: string; message: string }) {
  return (
    <div className="parts-error">
      <AlertCircle size={16} />
      <span>{message}</span>
      <code className="parts-error-code">{code}</code>
    </div>
  );
}

export function MessageParts({ parts }: MessagePartsProps) {
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
