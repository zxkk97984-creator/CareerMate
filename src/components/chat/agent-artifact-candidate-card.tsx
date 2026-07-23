"use client";

import { useState } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

interface AgentArtifactCandidateCardProps {
  candidateId: string;
  candidateType: string;
  taskType: string;
  summary: string;
}

const CANDIDATE_TYPE_LABELS: Record<string, string> = {
  profile_patch: "画像补丁",
  ability_evidence: "能力证据",
  career_plan: "职业计划",
  learning_route: "学习路线",
  growth_replan: "成长重规划",
  memory_item: "记忆条目",
  career_template_draft: "岗位模板草稿",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  profile_assessment: "画像评估",
  career_exploration: "职业探索",
  career_plan: "职业计划",
  learning_route: "学习路线",
  simulation_turn: "模拟回合",
  simulation_report: "模拟报告",
  resume_review: "简历审查",
  growth_review: "成长回顾",
  memory_item: "记忆条目",
  career_template_draft: "岗位模板草稿",
};

export function AgentArtifactCandidateCard({
  candidateId,
  candidateType,
  taskType,
  summary,
}: AgentArtifactCandidateCardProps) {
  const [status, setStatus] = useState<"pending" | "accepted" | "rejected">("pending");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const isPending = status === "pending";
  const typeLabel = CANDIDATE_TYPE_LABELS[candidateType] ?? candidateType;
  const taskLabel = TASK_TYPE_LABELS[taskType] ?? taskType;

  const handleDecision = async (decision: "accept" | "reject") => {
    setError(null);
    try {
      const res = await fetch(`/api/agentic-v2/candidates/${candidateId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json();

      if (!body.ok) {
        if (res.status === 409) {
          setError("数据版本已变化，请重新生成候选");
        } else {
          setError(body.error?.message ?? "操作失败");
        }
        return;
      }

      setStatus(body.data.status);
    } catch {
      setError("网络错误，请重试");
    }
  };

  const handleToggleDetail = async () => {
    if (detail) {
      setExpanded(!expanded);
      return;
    }
    try {
      const res = await fetch(`/api/agentic-v2/candidates/${candidateId}`);
      const body = await res.json();
      if (body.ok) {
        setDetail(body.data);
      }
    } catch {
      // 加载详情失败，仍然展开（显示加载失败提示）
    }
    setExpanded(!expanded);
  };

  return (
    <div className="agent-candidate-card">
      <div className="candidate-card-header">
        <span className="candidate-type-badge">{typeLabel}</span>
        <span className="candidate-task-badge">{taskLabel}</span>
        {!isPending && (
          <span className={`candidate-status-badge status-${status}`}>
            {status === "accepted" ? "已接受" : "已拒绝"}
          </span>
        )}
      </div>

      <p className="candidate-summary">{summary}</p>

      {error && <p className="candidate-error">{error}</p>}

      <div className="candidate-card-actions">
        <button
          className="candidate-action-btn btn-accept"
          disabled={!isPending}
          onClick={() => handleDecision("accept")}
        >
          <CheckCircle size={16} />
          <span>接受</span>
        </button>
        <button
          className="candidate-action-btn btn-reject"
          disabled={!isPending}
          onClick={() => handleDecision("reject")}
        >
          <XCircle size={16} />
          <span>拒绝</span>
        </button>
        <button
          className="candidate-action-btn btn-detail"
          onClick={handleToggleDetail}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>查看依据</span>
        </button>
      </div>

      {expanded && detail && (
        <div className="candidate-detail">
          {detail.artifact && typeof detail.artifact === "object" && (
            <div className="candidate-detail-section">
              {(detail.artifact as Record<string, unknown>).evidence && (
                <div className="detail-block">
                  <h5>证据</h5>
                  <ul>
                    {((detail.artifact as Record<string, unknown>).evidence as Array<unknown>).map((item, i) => (
                      <li key={i}>{String(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(detail.artifact as Record<string, unknown>).assumptions && (
                <div className="detail-block">
                  <h5>假设</h5>
                  <ul>
                    {((detail.artifact as Record<string, unknown>).assumptions as Array<unknown>).map((item, i) => (
                      <li key={i}>{String(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(detail.artifact as Record<string, unknown>).warnings && (
                <div className="detail-block">
                  <h5>警告</h5>
                  <ul>
                    {((detail.artifact as Record<string, unknown>).warnings as Array<unknown>).map((item, i) => (
                      <li key={i}>{String(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(detail.artifact as Record<string, unknown>).sources && (
                <div className="detail-block">
                  <h5>来源</h5>
                  <ul>
                    {((detail.artifact as Record<string, unknown>).sources as Array<unknown>).map((item, i) => (
                      <li key={i}>{String(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(detail.artifact as Record<string, unknown>).nextActions && (
                <div className="detail-block">
                  <h5>后续行动</h5>
                  <ul>
                    {((detail.artifact as Record<string, unknown>).nextActions as Array<unknown>).map((item, i) => (
                      <li key={i}>{String(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
