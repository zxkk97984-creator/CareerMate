"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "@/lib/client-api";
import {
  buildSuggestionList,
  loadSuggestionDetail,
  type ArtifactSource,
  type MemorySource,
  type PendingPlanSource,
  type ProfileCandidateSource,
  type SuggestionDetailResult,
  type SuggestionKind,
  type SuggestionListItem,
  type SuggestionRef,
} from "@/lib/suggestions";
import type { CareerPlanDto } from "@/lib/types";

/** 建议中心聚合读模型 hook：拉取四种来源，构建与计数同源的待确认列表，按 kind 加载详情。 */
export function useSuggestions() {
  const [items, setItems] = useState<SuggestionListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const reload = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    const [profileR, memoriesR, planR, artifactR] = await Promise.all([
      fetchApi<{ items: ProfileCandidateSource[] }>("/api/profile/candidates"),
      fetchApi<{ items: MemorySource[] }>("/api/memories"),
      fetchApi<{ plan: CareerPlanDto | null; pendingPlan: CareerPlanDto | null }>("/api/plans/current"),
      fetchApi<{ items: ArtifactSource[] }>("/api/agentic-v2/candidates?status=pending"),
    ]);
    if (seq !== seqRef.current || !mountedRef.current) return;

    const plan = planR.ok ? planR.data.pendingPlan : null;
    const list = buildSuggestionList({
      profile: profileR.ok ? profileR.data.items : [],
      memory: memoriesR.ok ? memoriesR.data.items : [],
      plan: plan ? [toPendingPlanSource(plan)] : [],
      artifact: artifactR.ok ? artifactR.data.items : [],
    });

    setItems(list.items);
    setPendingCount(list.pendingCount);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const loadDetail = useCallback(async (ref: SuggestionRef): Promise<SuggestionDetailResult<SuggestionKind>> => {
    return loadSuggestionDetail(ref, {
      artifact: async (id) => {
        const r = await fetchApi<{ artifact: unknown; candidateType: string; baseVersion?: string | null }>(`/api/agentic-v2/candidates/${id}`);
        if (!r.ok) return { ok: false, status: r.status, message: r.error.message };
        return detailFromArtifact({ id, ...r.data });
      },
    });
  }, []);

  return { items, pendingCount, loading, error, reload, loadDetail };
}

function toPendingPlanSource(plan: CareerPlanDto): PendingPlanSource {
  return {
    id: plan.id,
    status: plan.status,
    title: plan.targetRoleLabel ? `${plan.targetRoleLabel} 职业计划` : "新职业计划",
    createdAt: plan.updatedAt ?? null,
  };
}

function detailFromArtifact(data: { id: string; candidateType: string; artifact: unknown; baseVersion?: string | null }): SuggestionDetailResult<"artifact"> {
  return {
    ok: true,
    detail: {
      kind: "artifact", ref: { kind: "artifact", id: data.id },
      candidateType: data.candidateType,
      artifact: data.artifact,
      title: "",
      status: "pending",
      reason: "",
      evidenceSummary: null,
      impactSummary: null,
      source: null,
      baseVersion: data.baseVersion ?? null,
      createdAt: null,
    },
  };
}
