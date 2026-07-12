"use client";

/** 资源中心 —— 按岗位/能力/类型筛选学习资源 */
import { useState } from "react";
import { filterResources } from "@/lib/resources";
import { abilityKeys, abilityLabels, resourceTypes, supportedRoleKeys, type ProfileDto, type ResourceItemDto } from "@/lib/types";

/* ── 局部工具 ── */

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-base font-semibold text-slate-950">{title}</h2>{action}</div><div className="p-5">{children}</div></section>;
}

/* ── 主视图 ── */

interface ResourceViewProps { resources: ResourceItemDto[]; profile: ProfileDto; weakAbilities: string[]; }

export function ResourceView({ resources, profile, weakAbilities }: ResourceViewProps) {
  const [roleKey, setRoleKey] = useState(profile.targetRole);
  const [abilityKey, setAbilityKey] = useState<string>("all");
  const [resourceType, setResourceType] = useState<string>("all");
  const relevant = filterResources(resources, { roleKey, abilityKey, type: resourceType });
  const roleLabels: Record<string, string> = { ai_product_manager: "AI 产品经理", data_analyst: "数据分析师", aigc_operator: "AIGC 运营" };

  return (
    <Panel title="资源中心">
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-600">目标岗位<select className="mt-1 block h-10 w-full rounded-md border border-slate-200 bg-white px-3" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>{supportedRoleKeys.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}</select></label>
        <label className="text-sm text-slate-600">能力方向<select className="mt-1 block h-10 w-full rounded-md border border-slate-200 bg-white px-3" value={abilityKey} onChange={(e) => setAbilityKey(e.target.value)}><option value="all">全部能力</option>{abilityKeys.map((a) => <option key={a} value={a}>{abilityLabels[a]}</option>)}</select></label>
        <label className="text-sm text-slate-600">资源类型<select className="mt-1 block h-10 w-full rounded-md border border-slate-200 bg-white px-3" value={resourceType} onChange={(e) => setResourceType(e.target.value)}><option value="all">全部类型</option>{resourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      </div>
      {weakAbilities.length ? <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-slate-600"><span>优先补弱：</span>{weakAbilities.map((a) => (<button key={a} onClick={() => setAbilityKey(a)} className={`rounded-full px-3 py-1 ${abilityKey === a ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800"}`}>{abilityLabels[a as keyof typeof abilityLabels]}</button>))}</div> : null}
      {relevant.length === 0 ? <div className="rounded-md bg-slate-50 p-5 text-sm text-slate-600">没有符合当前筛选条件的资源。</div> : null}
      <div className="grid gap-4 md:grid-cols-2">{relevant.map((item) => (<div key={item.id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-slate-950">{item.title}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{item.type}</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p><div className="mt-3 text-xs text-slate-500">来源：{item.source}</div></div>))}</div>
    </Panel>
  );
}
