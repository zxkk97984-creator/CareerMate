"use client";

/**
 * 资源中心：学习资源 + 岗位样本。
 *
 * 学习资源先显示与当前任务相关的材料，再提供搜索与筛选；
 * 岗位样本只读取本地 BOSS 增量导入数据，不新增爬虫或公开招聘服务。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, Link2, Search, X, XCircle } from "lucide-react";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SurfaceCard } from "@/components/ui/surface-card";
import { fetchApi } from "@/lib/client-api";
import { filterResources } from "@/lib/resources";
import { buildRoleOptions, roleLabelFor } from "@/lib/role-options";
import {
  abilityKeys,
  abilityLabels,
  resourceTypeLabels,
  resourceTypes,
  type JobSampleDto,
  type ProfileDto,
  type ResourceItemDto,
  type ResourceType,
} from "@/lib/types";

interface ResourceViewProps {
  resources: ResourceItemDto[];
  profile: ProfileDto;
  weakAbilities: string[];
}

interface TaskContext {
  taskId: string | null;
  planId: string | null;
  taskTitle: string | null;
  roleKey: string | null;
}

interface TboxItem {
  content: string;
  source: string;
  score: number;
}

interface ResourceAssociationState {
  resourceId: string;
  candidateId: string | null;
  status: "pending" | "accepted" | "rejected";
  error: string | null;
}

interface JobsPayload {
  items: JobSampleDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: {
    cities: Array<{ value: string; count: number }>;
    roleKeys: Array<{ value: string | null; count: number }>;
    experiences: Array<{ value: string | null; count: number }>;
    educations: Array<{ value: string | null; count: number }>;
  };
  dataNotice: {
    purpose: string;
    verificationStatus: string;
    collectedAtApproximate: boolean;
    salaryComparability: string;
  };
}

function summarizeTboxContent(content: string): { title: string; description: string } {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => /^- title[:：]/i.test(line));
  const title = titleLine ? titleLine.replace(/^- title[:：]\s*/i, "") : lines[0]?.replace(/^#+\s*/, "") || "学习资源";
  const descriptionLine = lines.find((line) => /^- description[:：]/i.test(line));
  const description = descriptionLine
    ? descriptionLine.replace(/^- description[:：]\s*/i, "")
    : content.replace(/\s+/g, " ").slice(0, 280);
  return {
    title: title.slice(0, 160) || "学习资源",
    description: description.slice(0, 320) || "点击查看完整资源内容。",
  };
}

function ResourceCard({
  item,
  onOpen,
}: {
  item: ResourceItemDto;
  onOpen: () => void;
}) {
  return (
    <article className="resource-card resource-card-v2">
      <div className="resource-card-head">
        <div>
          <span className="resource-type">{resourceTypeLabels[item.type as ResourceType] ?? item.type}</span>
          <h3>{item.title}</h3>
        </div>
        {item.verificationStatus === "verified" ? (
          <span className="resource-verified">已核验链接</span>
        ) : (
          <span className="resource-unverified">待核验</span>
        )}
      </div>
      <p className="resource-card-desc">{item.description}</p>
      <div className="resource-card-meta">
        <span>来源：{item.provider ?? item.source}</span>
        {item.estimatedHours != null ? <span>约 {item.estimatedHours} 小时</span> : null}
        {item.difficulty ? <span>{item.difficulty}</span> : null}
      </div>
      <div className="resource-card-actions">
        <button type="button" onClick={onOpen}>查看详情</button>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> 访问资源
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ResourceDetail({
  resource,
  onClose,
  taskContext,
  association,
  busy,
  onAssociate,
  onDecide,
}: {
  resource: ResourceItemDto;
  onClose: () => void;
  taskContext: TaskContext | null;
  association: ResourceAssociationState | null;
  busy: boolean;
  onAssociate: () => void;
  onDecide: (decision: "accept" | "reject") => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, resource.id]);

  return (
    <aside className="resource-detail" role="dialog" aria-modal="true" aria-label={`${resource.title} 详情`}>
      <button ref={closeRef} type="button" className="resource-detail-close" onClick={onClose} aria-label="关闭资源详情">
        <X size={18} />
      </button>
      <span className="resource-type">{resourceTypeLabels[resource.type as ResourceType] ?? resource.type}</span>
      <h2>{resource.title}</h2>
      <p className="resource-detail-desc">{resource.description}</p>
      {resource.detail ? <p className="resource-detail-text">{resource.detail}</p> : null}
      <dl className="resource-detail-list">
        <div><dt>来源</dt><dd>{resource.provider ?? resource.source}</dd></div>
        <div><dt>预计投入</dt><dd>{resource.estimatedHours != null ? `${resource.estimatedHours} 小时` : "未标注"}</dd></div>
        <div><dt>核验状态</dt><dd>{resource.verificationStatus === "verified" ? "已验证链接/来源" : "待核验"}</dd></div>
        {resource.validUntil ? <div><dt>有效期</dt><dd>{new Date(resource.validUntil).toLocaleDateString("zh-CN")}</dd></div> : null}
      </dl>
      {resource.steps?.length ? (
        <section>
          <h3>实践步骤</h3>
          <ol>{resource.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
      ) : null}
      {resource.deliverables?.length ? (
        <section>
          <h3>交付物</h3>
          <ul>{resource.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {resource.acceptanceCriteria?.length ? (
        <section>
          <h3>验收标准</h3>
          <ul>{resource.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}
      {resource.url ? (
        <a className="resource-detail-link" href={resource.url} target="_blank" rel="noopener noreferrer">
          访问原始资源 <ExternalLink size={14} />
        </a>
      ) : (
        <p className="resource-detail-note">该条目没有可访问 URL，仅作为实践说明使用。</p>
      )}
      {taskContext?.taskId && taskContext.planId ? (
        <section className="resource-association" aria-label="关联到当前任务">
          <h3>关联到当前任务</h3>
          <p>资源不会直接写入计划。确认候选后才会加入「{taskContext.taskTitle ?? "当前任务"}」的关联材料。</p>
          {association?.error ? <InlineAlert tone="error">{association.error}</InlineAlert> : null}
          {!association || association.status === "rejected" ? (
            <button type="button" disabled={busy} onClick={onAssociate}>
              <Link2 size={14} /> {busy ? "正在生成候选..." : "生成关联候选"}
            </button>
          ) : association.status === "pending" ? (
            <div className="resource-association-actions">
              <span>已生成待确认候选，确认前不会修改正式计划。</span>
              <button type="button" disabled={busy} onClick={() => onDecide("accept")}>
                <CheckCircle2 size={14} /> 确认关联
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide("reject")}>
                <XCircle size={14} /> 取消
              </button>
            </div>
          ) : (
            <div className="resource-association-actions">
              <span>已确认关联，职业路径任务详情会显示该资源。</span>
              <Link href={`/path?taskId=${encodeURIComponent(taskContext.taskId)}`}>查看任务</Link>
            </div>
          )}
        </section>
      ) : null}
    </aside>
  );
}

function salaryLabel(job: JobSampleDto): string {
  if (!job.salaryRaw) return "薪资未提供";
  if (job.salaryComparable && job.salaryUnit) {
    const unit = { month: "月", day: "日", hour: "小时", year: "年" }[job.salaryUnit] ?? job.salaryUnit;
    return `${job.salaryRaw}（按${unit}薪解析）`;
  }
  return `${job.salaryRaw}（${job.salaryNote}）`;
}

function JobCard({ job, onOpen }: { job: JobSampleDto; onOpen: () => void }) {
  return (
    <article className="job-card">
      <div className="job-card-head">
        <div>
          <h3>{job.title}</h3>
          <p>{job.company ?? "公司未提供"} · {job.city}</p>
        </div>
        <span className="job-status">未核验</span>
      </div>
      <div className="job-card-salary">{salaryLabel(job)}</div>
      <div className="job-card-tags">
        {job.experience ? <span>{job.experience}</span> : null}
        {job.education ? <span>{job.education}</span> : null}
        {job.skills.slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}
      </div>
      <p className="job-card-jd">{job.jd || "该岗位没有详情 JD，仅保留列表字段。"}</p>
      <div className="job-card-actions">
        <button type="button" onClick={onOpen}>查看 JD 与来源</button>
        {job.jobLink ? (
          <a href={job.jobLink} target="_blank" rel="noopener noreferrer">
            原始链接 <ExternalLink size={13} />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function JobDetail({ job, onClose }: { job: JobSampleDto; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [job.id, onClose]);

  return (
    <aside className="resource-detail job-detail" role="dialog" aria-modal="true" aria-label={`${job.title} 岗位详情`}>
      <button ref={closeRef} type="button" className="resource-detail-close" onClick={onClose} aria-label="关闭岗位详情">
        <X size={18} />
      </button>
      <span className="job-status">岗位状态未核验</span>
      <h2>{job.title}</h2>
      <p className="resource-detail-desc">{job.company ?? "公司未提供"} · {job.city}</p>
      <dl className="resource-detail-list">
        <div><dt>薪资原文</dt><dd>{job.salaryRaw || "未提供"}</dd></div>
        <div><dt>薪资解释</dt><dd>{job.salaryNote}</dd></div>
        <div><dt>经验 / 学历</dt><dd>{[job.experience, job.education].filter(Boolean).join(" · ") || "未提供"}</dd></div>
        <div><dt>采集批次</dt><dd>{job.sourceBatch}{job.collectionDateApprox && job.collectedAt ? ` · 约 ${new Date(job.collectedAt).toLocaleDateString("zh-CN")}` : " · 采集日期未知"}</dd></div>
        <div><dt>来源文件</dt><dd>{job.sourceFile.join("、") || "未知"}</dd></div>
      </dl>
      <section>
        <h3>技能要求</h3>
        <div className="job-card-tags">{job.skills.length ? job.skills.map((skill) => <span key={skill}>{skill}</span>) : <span>未提取到技能标签</span>}</div>
      </section>
      <section>
        <h3>岗位 JD</h3>
        <p className="job-jd-full">{job.jd || "该样本没有详情 JD。"}</p>
      </section>
      {job.fieldConflicts.length > 0 ? (
        <section>
          <h3>字段冲突记录</h3>
          <ul>{job.fieldConflicts.map((conflict) => (
            <li key={conflict.field}>{conflict.field}：{conflict.values.map((value) => value.value).join(" / ")}</li>
          ))}</ul>
        </section>
      ) : null}
      <div className="job-detail-actions">
        <Link href={`/chat?intent=job-gap&jobId=${encodeURIComponent(job.jobId)}`}>基于岗位做差距分析</Link>
        <Link href={`/chat?intent=plan-adjust&jobId=${encodeURIComponent(job.jobId)}`}>调整学习计划</Link>
        <Link href={`/simulation?jobId=${encodeURIComponent(job.jobId)}`}>用该岗位开始模拟训练</Link>
      </div>
      {job.jobLink ? <a className="resource-detail-link" href={job.jobLink} target="_blank" rel="noopener noreferrer">打开原始岗位链接 <ExternalLink size={14} /></a> : null}
    </aside>
  );
}

export function ResourceView({ resources, profile, weakAbilities }: ResourceViewProps) {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  const planId = searchParams.get("planId");
  const [activeTab, setActiveTab] = useState<"learning" | "jobs">("learning");
  const [roleKey, setRoleKey] = useState(profile.targetRole ?? "");
  const [abilityKey, setAbilityKey] = useState("all");
  const [resourceType, setResourceType] = useState("all");
  const [query, setQuery] = useState("");
  const [taskContext, setTaskContext] = useState<TaskContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [relatedResources, setRelatedResources] = useState<ResourceItemDto[]>([]);
  const [selectedResource, setSelectedResource] = useState<ResourceItemDto | null>(null);
  const [resourceAssociation, setResourceAssociation] = useState<ResourceAssociationState | null>(null);
  const [associationBusy, setAssociationBusy] = useState(false);
  const [tboxItems, setTboxItems] = useState<TboxItem[]>([]);
  const [tboxLoading, setTboxLoading] = useState(false);
  const [tboxSearched, setTboxSearched] = useState(false);
  const [tboxError, setTboxError] = useState<string | null>(null);
  const tboxSeq = useRef(0);

  const [jobs, setJobs] = useState<JobSampleDto[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsTotalPages, setJobsTotalPages] = useState(1);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsFacets, setJobsFacets] = useState<JobsPayload["facets"] | null>(null);
  const [jobNotice, setJobNotice] = useState<JobsPayload["dataNotice"] | null>(null);
  const [jobFilters, setJobFilters] = useState({ city: "", roleKey: "", experience: "", education: "", salaryUnit: "", q: "" });
  const [selectedJob, setSelectedJob] = useState<JobSampleDto | null>(null);

  const resourceRoleKeys = Array.from(new Set(resources.map((item) => item.roleKey).filter(Boolean)));
  const roleOptions = buildRoleOptions(profile, resourceRoleKeys);
  const taskAwareResources = taskContext ? relatedResources : resources;
  const filteredResources = filterResources(taskAwareResources, {
    roleKey: roleKey || "all",
    abilityKey,
    type: resourceType,
  }).filter((item) => {
    const text = `${item.title} ${item.description} ${item.provider ?? ""}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!taskId && !planId) return;
    let active = true;
    void (async () => {
      const params = new URLSearchParams();
      if (taskId) params.set("taskId", taskId);
      if (planId) params.set("planId", planId);
      const response = await fetchApi<{ items?: ResourceItemDto[]; context?: TaskContext }>(`/api/resources?${params.toString()}`);
      if (!active) return;
      if (!response.ok) {
        setContextError(response.error?.message ?? "无法验证任务上下文");
        return;
      }
      if (response.data.context) {
        setTaskContext(response.data.context);
        if (response.data.context.roleKey) setRoleKey(response.data.context.roleKey);
      }
      setRelatedResources(response.data.items ?? []);
    })();
    return () => { active = false; };
  }, [taskId, planId]);

  useEffect(() => {
    if (activeTab !== "jobs") return;
    let active = true;
    setJobsLoading(true);
    setJobsError(null);
    const params = new URLSearchParams({ page: String(jobsPage), pageSize: "20" });
    Object.entries(jobFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
    void (async () => {
      const response = await fetchApi<JobsPayload>(`/api/jobs?${params.toString()}`);
      if (!active) return;
      setJobsLoading(false);
      if (!response.ok) {
        setJobsError(response.error?.message ?? "岗位样本加载失败");
        setJobs([]);
        return;
      }
      setJobs(response.data.items);
      setJobsTotal(response.data.pagination.total);
      setJobsTotalPages(response.data.pagination.totalPages);
      setJobsFacets(response.data.facets);
      setJobNotice(response.data.dataNotice);
    })();
    return () => { active = false; };
  }, [activeTab, jobsPage, jobFilters]);

  const firstScreenResources = filteredResources;

  async function searchTbox() {
    const term = query.trim();
    if (!term) return;
    const seq = ++tboxSeq.current;
    setTboxLoading(true);
    setTboxError(null);
    const response = await fetchApi<{ items?: TboxItem[] }>("/api/tbox/retrieve", {
      method: "POST",
      body: JSON.stringify({ datasetKey: "learningResources", query: term, limit: 10 }),
    });
    if (seq !== tboxSeq.current) return;
    setTboxLoading(false);
    setTboxSearched(true);
    if (!response.ok) {
      setTboxItems([]);
      setTboxError(response.error?.message ?? "百宝箱检索失败");
      return;
    }
    setTboxItems(response.data.items ?? []);
  }

  const closeResource = useCallback(() => setSelectedResource(null), []);
  const closeJob = useCallback(() => setSelectedJob(null), []);

  function openResource(resource: ResourceItemDto) {
    setResourceAssociation(null);
    setSelectedResource(resource);
    void (async () => {
      const response = await fetchApi<{ resource: ResourceItemDto }>(`/api/resources/${resource.id}`);
      if (response.ok) setSelectedResource(response.data.resource);
    })();
  }

  async function associateResource(resource: ResourceItemDto) {
    if (!taskContext?.taskId || !taskContext.planId || associationBusy) return;
    setAssociationBusy(true);
    const response = await fetchApi<{
      kind: "pending" | "unchanged";
      candidateId: string | null;
      requiresUserConfirmation: boolean;
    }>(
      `/api/plans/${encodeURIComponent(taskContext.planId)}/tasks/${encodeURIComponent(taskContext.taskId)}/resources`,
      { method: "POST", body: JSON.stringify({ resourceId: resource.id }) },
    );
    setAssociationBusy(false);
    if (!response.ok) {
      setResourceAssociation({
        resourceId: resource.id,
        candidateId: null,
        status: "pending",
        error: response.error?.message ?? "关联候选创建失败",
      });
      return;
    }
    setResourceAssociation({
      resourceId: resource.id,
      candidateId: response.data.candidateId,
      status: response.data.kind === "unchanged" ? "accepted" : "pending",
      error: null,
    });
  }

  async function decideResourceAssociation(decision: "accept" | "reject") {
    if (!resourceAssociation?.candidateId || associationBusy) return;
    setAssociationBusy(true);
    const response = await fetchApi<{ status: "accepted" | "rejected" }>(
      `/api/agentic-v2/candidates/${encodeURIComponent(resourceAssociation.candidateId)}/decision`,
      { method: "POST", body: JSON.stringify({ decision }) },
    );
    setAssociationBusy(false);
    if (!response.ok) {
      setResourceAssociation((current) => current
        ? { ...current, error: response.error?.message ?? "候选处理失败" }
        : current);
      return;
    }
    setResourceAssociation((current) => current
      ? { ...current, status: response.data.status, error: null }
      : current);
  }

  return (
    <div data-od-id="resources-layout">
      <div className="resource-tabs" role="tablist" aria-label="资源中心">
        <button type="button" role="tab" aria-selected={activeTab === "learning"} className={activeTab === "learning" ? "active" : ""} onClick={() => setActiveTab("learning")}>
          学习资源
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "jobs"} className={activeTab === "jobs" ? "active" : ""} onClick={() => setActiveTab("jobs")}>
          岗位样本
        </button>
      </div>

      {activeTab === "learning" ? (
        <>
          {(taskId || planId) ? (
            <div className="resource-context-bar">
              <div>
                {contextError ? contextError : taskContext?.taskTitle ? <>为当前任务查找资源：<strong>{taskContext.taskTitle}</strong></> : "为当前任务查找资源"}
              </div>
              <Link href="/path"><ArrowLeft size={14} /> 返回任务</Link>
            </div>
          ) : null}

          <SurfaceCard title="与当前任务相关" description="先看能直接推进任务的资源，再按条件筛选">
            <div className="resource-filter-row">
              <input className="cm-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、来源或说明" onKeyDown={(event) => { if (event.key === "Enter") void searchTbox(); }} />
              <button type="button" className="resource-search-btn" disabled={tboxLoading || !query.trim()} onClick={() => void searchTbox()}>
                <Search size={14} /> {tboxLoading ? "检索中..." : "搜索资源"}
              </button>
            </div>
            <div className="resource-filter-grid">
              <label>目标岗位<select className="cm-select" value={roleKey} onChange={(event) => setRoleKey(event.target.value)}><option value="">全部岗位</option>{roleOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
              <label>能力方向<select className="cm-select" value={abilityKey} onChange={(event) => setAbilityKey(event.target.value)}><option value="all">全部能力</option>{abilityKeys.map((key) => <option key={key} value={key}>{abilityLabels[key]}</option>)}</select></label>
              <label>资源类型<select className="cm-select" value={resourceType} onChange={(event) => setResourceType(event.target.value)}><option value="all">全部类型</option>{resourceTypes.map((type) => <option key={type} value={type}>{resourceTypeLabels[type]}</option>)}</select></label>
            </div>
            {weakAbilities.length > 0 ? (
              <div className="resource-weak-row">
                <span>优先补弱：</span>
                {weakAbilities.map((ability) => <button key={ability} type="button" className={abilityKey === ability ? "active" : ""} onClick={() => setAbilityKey(ability)}>{abilityLabels[ability as keyof typeof abilityLabels]}</button>)}
              </div>
            ) : null}
          </SurfaceCard>

          {tboxSearched ? (
            <SurfaceCard title="百宝箱检索结果" description="来自平台学习资源库，展示完整内容前不标记为已核验课程">
              {tboxError ? <InlineAlert tone="error">{tboxError}</InlineAlert> : tboxItems.length === 0 ? (
                <p className="resource-empty">没有匹配结果。可以换一个关键词，或回到本地已核验资源继续筛选。</p>
              ) : (
                <div className="resource-grid">
                  {tboxItems.map((item, index) => {
                    const summary = summarizeTboxContent(item.content);
                    return (
                      <article key={`${item.source}-${index}`} className="resource-card resource-card-v2">
                        <h3>{summary.title}</h3>
                        <p className="resource-card-desc">{summary.description}</p>
                        <details>
                          <summary>查看完整内容</summary>
                          <pre>{item.content}</pre>
                        </details>
                        <div className="resource-card-meta"><span>{item.source}</span><span>相关度 {Math.round(item.score * 100)}%</span></div>
                      </article>
                    );
                  })}
                </div>
              )}
            </SurfaceCard>
          ) : null}

          <SurfaceCard title={taskContext ? "当前任务相关资源" : "学习资源"} description={`${firstScreenResources.length} 条可用资源`}>
            {resources.length === 0 ? (
              <div className="resource-empty">
                <strong>资源库尚未配置</strong>
                <p>管理员可运行增量导入命令补充带 URL 和完整实践说明的资源；不会清空现有数据。</p>
                <code>npm run import:resources</code>
              </div>
            ) : firstScreenResources.length === 0 ? (
              <p className="resource-empty">没有符合当前筛选条件的资源，换个条件试试。</p>
            ) : (
              <div className="resource-grid">
                {firstScreenResources.map((resource) => <ResourceCard key={resource.id} item={resource} onOpen={() => openResource(resource)} />)}
              </div>
            )}
          </SurfaceCard>
        </>
      ) : (
        <>
          <SurfaceCard title="岗位样本" description="BOSS 本地样本，仅用于分析与演示；岗位状态未核验">
            {jobNotice ? <p className="job-data-notice">{jobNotice.purpose} · {jobNotice.salaryComparability}</p> : null}
            <div className="job-filter-grid">
              <label>城市<select className="cm-select" value={jobFilters.city} onChange={(event) => { setJobsPage(1); setJobFilters((current) => ({ ...current, city: event.target.value })); }}><option value="">全部城市</option>{jobsFacets?.cities.map((item) => <option key={item.value} value={item.value}>{item.value}（{item.count}）</option>)}</select></label>
              <label>职业<select className="cm-select" value={jobFilters.roleKey} onChange={(event) => { setJobsPage(1); setJobFilters((current) => ({ ...current, roleKey: event.target.value })); }}><option value="">全部职业</option>{jobsFacets?.roleKeys.filter((item) => item.value).map((item) => <option key={item.value!} value={item.value!}>{roleLabelFor(item.value!, profile)}（{item.count}）</option>)}</select></label>
              <label>经验<select className="cm-select" value={jobFilters.experience} onChange={(event) => { setJobsPage(1); setJobFilters((current) => ({ ...current, experience: event.target.value })); }}><option value="">全部经验</option>{jobsFacets?.experiences.filter((item) => item.value).map((item) => <option key={item.value!} value={item.value!}>{item.value}</option>)}</select></label>
              <label>学历<select className="cm-select" value={jobFilters.education} onChange={(event) => { setJobsPage(1); setJobFilters((current) => ({ ...current, education: event.target.value })); }}><option value="">全部学历</option>{jobsFacets?.educations.filter((item) => item.value).map((item) => <option key={item.value!} value={item.value!}>{item.value}</option>)}</select></label>
              <label>薪资单位<select className="cm-select" value={jobFilters.salaryUnit} onChange={(event) => { setJobsPage(1); setJobFilters((current) => ({ ...current, salaryUnit: event.target.value })); }}><option value="">全部单位</option><option value="month">月薪</option><option value="day">日薪</option><option value="hour">时薪</option><option value="year">年薪</option></select></label>
              <label>关键词<input className="cm-input" value={jobFilters.q} onChange={(event) => { setJobsPage(1); setJobFilters((current) => ({ ...current, q: event.target.value })); }} placeholder="岗位、技能或 JD" /></label>
            </div>
          </SurfaceCard>

          {jobsError ? <InlineAlert tone="error">{jobsError}</InlineAlert> : null}
          <SurfaceCard title="岗位列表" description={jobsLoading ? "正在加载..." : `共 ${jobsTotal} 条，当前第 ${jobsPage}/${jobsTotalPages} 页`}>
            {jobs.length === 0 && !jobsLoading ? (
              <p className="resource-empty">没有符合当前条件的岗位样本。可以清空筛选，或确认岗位数据已导入。</p>
            ) : (
              <div className="job-grid">
                {jobs.map((job) => <JobCard key={job.id} job={job} onOpen={() => setSelectedJob(job)} />)}
              </div>
            )}
            <div className="job-pagination">
              <button type="button" disabled={jobsPage <= 1 || jobsLoading} onClick={() => setJobsPage((page) => Math.max(1, page - 1))}>上一页</button>
              <span>{jobsPage} / {jobsTotalPages}</span>
              <button type="button" disabled={jobsPage >= jobsTotalPages || jobsLoading} onClick={() => setJobsPage((page) => Math.min(jobsTotalPages, page + 1))}>下一页</button>
            </div>
          </SurfaceCard>
        </>
      )}

      {selectedResource ? (
        <ResourceDetail
          resource={selectedResource}
          onClose={closeResource}
          taskContext={taskContext}
          association={resourceAssociation?.resourceId === selectedResource.id ? resourceAssociation : null}
          busy={associationBusy}
          onAssociate={() => void associateResource(selectedResource)}
          onDecide={(decision) => void decideResourceAssociation(decision)}
        />
      ) : null}
      {selectedJob ? <JobDetail job={selectedJob} onClose={closeJob} /> : null}
    </div>
  );
}
