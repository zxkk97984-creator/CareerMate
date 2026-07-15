"use client";

import { useCallback, useState } from "react";

// ── 类型 ────────────────────────────────────────

export interface MemoryProposalCardProps {
  memoryId: string;
  content: string;
  kind: "career_fact" | "preference" | "constraint" | "goal";
  sensitivity: "normal" | "sensitive";
  status: "pending" | "confirmed" | "rejected";
  onAccept: (memoryId: string) => void;
  onReject: (memoryId: string) => void;
  onEdit: (memoryId: string, newContent: string) => void;
}

const KIND_LABELS: Record<string, string> = {
  career_fact: "职业事实",
  preference: "偏好",
  constraint: "限制条件",
  goal: "目标",
};

// ── 组件 ────────────────────────────────────────

export function MemoryProposalCard({
  memoryId,
  content,
  kind,
  sensitivity,
  status,
  onAccept,
  onReject,
  onEdit,
}: MemoryProposalCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [currentStatus, setCurrentStatus] = useState(status);

  const handleAccept = useCallback(() => {
    setCurrentStatus("confirmed");
    onAccept(memoryId);
  }, [memoryId, onAccept]);

  const handleReject = useCallback(() => {
    setCurrentStatus("rejected");
    onReject(memoryId);
  }, [memoryId, onReject]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== content) {
      onEdit(memoryId, trimmed);
    }
    setIsEditing(false);
  }, [memoryId, editContent, content, onEdit]);

  if (currentStatus !== "pending") return null;

  return (
    <div
      data-testid="memory-proposal-card"
      data-memory-id={memoryId}
      data-kind={kind}
      data-sensitivity={sensitivity}
      className="border rounded-lg p-4 my-2 bg-card"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
          {KIND_LABELS[kind] ?? kind}
        </span>
        {sensitivity === "sensitive" && (
          <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">
            敏感信息
          </span>
        )}
        <span className="text-xs text-muted-foreground">记忆提议</span>
      </div>

      {isEditing ? (
        <textarea
          className="w-full p-2 border rounded text-sm min-h-[60px]"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          maxLength={2000}
        />
      ) : (
        <p className="text-sm mb-3">{content}</p>
      )}

      <div className="flex gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground"
              onClick={handleSaveEdit}
            >
              保存
            </button>
            <button
              type="button"
              className="px-3 py-1 text-sm rounded border"
              onClick={() => setIsEditing(false)}
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="memory-accept"
              className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground"
              onClick={handleAccept}
            >
              记住
            </button>
            <button
              type="button"
              data-testid="memory-edit"
              className="px-3 py-1 text-sm rounded border"
              onClick={() => setIsEditing(true)}
            >
              编辑
            </button>
            <button
              type="button"
              data-testid="memory-reject"
              className="px-3 py-1 text-sm rounded border text-muted-foreground"
              onClick={handleReject}
            >
              忽略
            </button>
          </>
        )}
      </div>
    </div>
  );
}
