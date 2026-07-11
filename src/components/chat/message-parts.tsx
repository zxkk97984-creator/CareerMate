"use client";

import type { ChatMessagePart } from "@/lib/chat/persistence";
import { AlertCircle, UserCheck, Map, Compass, Link2 } from "lucide-react";

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
  return (
    <div className="parts-card parts-card-candidate">
      <UserCheck size={16} />
      <span>画像候选：{candidateId}</span>
      <span className="parts-card-hint">可在成长档案中查看和确认</span>
    </div>
  );
}

function PlanRef({ version }: { planId: string; version: number }) {
  return (
    <div className="parts-card parts-card-plan">
      <Map size={16} />
      <span>职业计划 v{version}</span>
      <span className="parts-card-hint">可在职业路径页面查看完整计划</span>
    </div>
  );
}

function ExplorationReportRef({ }: { reportId: string }) {
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
