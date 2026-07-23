"use client";

import { useCallback, useState } from "react";
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

/** 安全格式化数组 + 非字符串元素转 JSON */
function safeListItem(item: unknown): string {
  if (item === null || item === undefined) return "无";
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  return JSON.stringify(item);
}

function safeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

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
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const isPending = status === "pending";
  const typeLabel = CANDIDATE_TYPE_LABELS[candidateType] ?? candidateType;
  const taskLabel = TASK_TYPE_LABELS[taskType] ?? taskType;

  // 加载详情时同步已 resolved 状态
  const handleToggleDetail = useCallback(async () => {
    if (loading) return;
    if (detail) {
      setExpanded((p) => !p);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/agentic-v2/candidates/${candidateId}`);
      const body = await res.json();
      if (body.ok && body.data) {
        setDetail(body.data);
        // 同步已 resolved 状态
        if (body.data.status === "accepted" || body.data.status === "rejected") {
          setStatus(body.data.status as "accepted" | "rejected");
        }
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
      setExpanded(true);
    }
  }, [candidateId, detail, loading]);

  const handleDecision = useCallback(async (decision: "accept" | "reject") => {
    if (deciding) return;
    setError(null);
    setDeciding(true);
    try {
      const res = await fetch(`/api/agentic-v2/candidates/${candidateId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(res.status === 409 ? "数据版本已变化，请重新生成候选" : (body.error?.message ?? "操作失败"));
        return;
      }
      setStatus(body.data.status);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setDeciding(false);
    }
  }, [candidateId, deciding]);

  const art = detail?.artifact as Record<string, unknown> | undefined;

  return (
    <div className="agent-candidate-card bg-white border rounded-lg p-4 my-2 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">{typeLabel}</span>
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{taskLabel}</span>
        {!isPending && (
          <span className={`px-2 py-0.5 text-xs rounded-full ${status === "accepted" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {status === "accepted" ? "已接受" : "已拒绝"}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-700 mb-3">{summary}</p>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isPending || deciding}
          onClick={() => handleDecision("accept")}
        >
          <CheckCircle size={14} />
          <span>{deciding ? "处理中..." : "接受"}</span>
        </button>
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isPending || deciding}
          onClick={() => handleDecision("reject")}
        >
          <XCircle size={14} />
          <span>拒绝</span>
        </button>
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          disabled={loading}
          onClick={handleToggleDetail}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{loading ? "加载中..." : "查看依据"}</span>
        </button>
      </div>

      {expanded && art && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
          {safeArray(art.evidence).length > 0 && (
            <div className="mb-2">
              <h5 className="font-medium text-gray-800 mb-1">证据</h5>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                {safeArray(art.evidence).map((item, i) => (
                  <li key={i}>{safeListItem(item)}</li>
                ))}
              </ul>
            </div>
          )}
          {safeArray(art.assumptions).length > 0 && (
            <div className="mb-2">
              <h5 className="font-medium text-gray-800 mb-1">假设</h5>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                {safeArray(art.assumptions).map((item, i) => (
                  <li key={i}>{safeListItem(item)}</li>
                ))}
              </ul>
            </div>
          )}
          {safeArray(art.warnings).length > 0 && (
            <div className="mb-2">
              <h5 className="font-medium text-amber-700 mb-1">警告</h5>
              <ul className="list-disc pl-5 space-y-0.5 text-amber-600">
                {safeArray(art.warnings).map((item, i) => (
                  <li key={i}>{safeListItem(item)}</li>
                ))}
              </ul>
            </div>
          )}
          {safeArray(art.sources).length > 0 && (
            <div className="mb-2">
              <h5 className="font-medium text-gray-800 mb-1">来源</h5>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                {safeArray(art.sources).map((item, i) => (
                  <li key={i}>{safeListItem(item)}</li>
                ))}
              </ul>
            </div>
          )}
          {safeArray(art.nextActions).length > 0 && (
            <div className="mb-2">
              <h5 className="font-medium text-gray-800 mb-1">后续行动</h5>
              <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                {safeArray(art.nextActions).map((item, i) => (
                  <li key={i}>{safeListItem(item)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
