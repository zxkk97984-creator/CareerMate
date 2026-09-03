"use client";

import { useCallback, useRef, useState } from "react";
import { playExitFade } from "@/lib/motion/settle";

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
  const rootRef = useRef<HTMLDivElement>(null);

  const handleAccept = useCallback(() => {
    playExitFade(rootRef.current, () => {
      setCurrentStatus("confirmed");
      onAccept(memoryId);
    });
  }, [memoryId, onAccept]);

  const handleReject = useCallback(() => {
    playExitFade(rootRef.current, () => {
      setCurrentStatus("rejected");
      onReject(memoryId);
    });
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
      ref={rootRef}
      data-testid="memory-proposal-card"
      data-memory-id={memoryId}
      data-kind={kind}
      data-sensitivity={sensitivity}
      className="border border-[var(--cm-border)] rounded-xl p-4 my-2 bg-[var(--cm-surface)] shadow-[var(--cm-shadow-card)]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cm-surface-soft)] text-[var(--cm-text-muted)]">
          {KIND_LABELS[kind] ?? kind}
        </span>
        {sensitivity === "sensitive" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cm-danger-bg)] text-[var(--cm-danger)]">
            敏感信息
          </span>
        )}
        <span className="text-xs text-[var(--cm-text-subtle)]">记忆提议</span>
      </div>

      {isEditing ? (
        <textarea
          className="w-full p-2 border border-[var(--cm-border-strong)] rounded-lg text-sm min-h-[60px] bg-[var(--cm-surface)] text-[var(--cm-text-strong)] outline-none focus:border-[var(--cm-brand)]"
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
              className="px-3 py-1 text-sm rounded-lg bg-[var(--cm-gradient-brand)] text-white hover:brightness-95"
              onClick={handleSaveEdit}
            >
              保存
            </button>
            <button
              type="button"
              className="px-3 py-1 text-sm rounded-lg border border-[var(--cm-border-strong)] text-[var(--cm-text-strong)] hover:bg-[var(--cm-surface-soft)]"
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
              className="px-3 py-1 text-sm rounded-lg bg-[var(--cm-gradient-brand)] text-white hover:brightness-95"
              onClick={handleAccept}
            >
              记住
            </button>
            <button
              type="button"
              data-testid="memory-edit"
              className="px-3 py-1 text-sm rounded-lg border border-[var(--cm-border-strong)] text-[var(--cm-text-strong)] hover:bg-[var(--cm-surface-soft)]"
              onClick={() => setIsEditing(true)}
            >
              编辑
            </button>
            <button
              type="button"
              data-testid="memory-reject"
              className="px-3 py-1 text-sm rounded-lg border border-[var(--cm-border-strong)] text-[var(--cm-text-muted)] hover:bg-[var(--cm-surface-soft)]"
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
