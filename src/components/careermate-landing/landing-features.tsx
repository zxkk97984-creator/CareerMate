export function FeatureShowcase() {
  return (
    <section aria-labelledby="features-title" className="cl-section cl-features" id="features">
      <div className="cl-container">
        <div className="cl-section-meta od-row">
          <span className="cl-section-number cl-mono">
            {"02 / 产品能力"}
          </span>
          <span>
            {"探索、行动、复盘，在同一处发生"}
          </span>
        </div>
        <div className="cl-section-heading cl-reveal">
          <h2 className="cl-section-title" id="features-title">
            {"一个工作台，"}
            <br />
            <em>
              {"接住每个成长阶段。"}
            </em>
          </h2>
          <p className="cl-section-description">
            {"从一段对话开始，连接你的目标、行动与反馈。"}
            <br />
            {"选择一项能力，看看你能如何使用它。"}
          </p>
        </div>
        <div className="cl-workspace cl-reveal">
          <div className="cl-workspace-bar od-row">
            <div className="cl-workspace-brand od-row">
              <svg aria-hidden="true" className="v2-logo" height="35" viewBox="0 0 40 40" width="35">
                <path d="M21 19V13C21 5 29 1 37 3c2 8-2 16-10 16Z" fill="#2367FF" />
                <path d="M19 21v6C19 35 11 39 3 37c-2-8 2-16 10-16Z" fill="#2367FF" />
                <path d="M19 19h-6C5 19 1 11 3 3c8-2 16 2 16 10Z" fill="#7EACFF" />
                <path d="M21 21h6c8 0 12 8 10 16-8 2-16-2-16-10Z" fill="#C5DBFF" />
              </svg>
              <span>
                {"CareerMate"}
              </span>
              <span aria-hidden="true" className="cl-divider">
                {"/"}
              </span>
              <span className="cl-workspace-context">
                {"我的成长空间"}
              </span>
            </div>
            <span className="cl-example-badge">
              {"功能示例"}
            </span>
          </div>
          <div aria-label="CareerMate 产品能力" className="cl-feature-tabs" role="tablist">
            <button aria-controls="panel-profile" aria-selected="true" data-feature="profile" id="tab-profile" role="tab" type="button">
              <span className="cl-mono">
                {"01"}
              </span>
              <span>
                {"能力画像"}
              </span>
            </button>
            <button aria-controls="panel-explore" aria-selected="false" data-feature="explore" id="tab-explore" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"02"}
              </span>
              <span>
                {"职业探索"}
              </span>
            </button>
            <button aria-controls="panel-plan" aria-selected="false" data-feature="plan" id="tab-plan" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"03"}
              </span>
              <span>
                {"行动计划"}
              </span>
            </button>
            <button aria-controls="panel-train" aria-selected="false" data-feature="train" id="tab-train" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"04"}
              </span>
              <span>
                {"模拟训练"}
              </span>
            </button>
            <button aria-controls="panel-resources" aria-selected="false" data-feature="resources" id="tab-resources" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"05"}
              </span>
              <span>
                {"学习资源"}
              </span>
            </button>
            <button aria-controls="panel-growth" aria-selected="false" data-feature="growth" id="tab-growth" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"06"}
              </span>
              <span>
                {"成长记录"}
              </span>
            </button>
          </div>
          <div aria-labelledby="tab-profile" className="cl-feature-panel" id="panel-profile" role="tabpanel" tabIndex={0}>
            <div className="cl-panel-heading">
              <div>
                <span className="cl-kicker">
                  {"先了解你"}
                </span>
                <h3>
                  {"从一次对话，开始认识你。"}
                </h3>
              </div>
              <p>
                {"输入你的经历与目标，"}
                <br />
                {"整理出下一步可以讨论的能力线索。"}
              </p>
            </div>
            <div className="cl-preview-grid">
              <div className="cl-chat-preview od-stack">
                <div className="cl-preview-label od-row">
                  <span className="cl-presence" />
                  <span>
                    {"和 CareerMate 聊一聊"}
                  </span>
                </div>
                <div className="cl-bubble cl-bubble-user">
                  {"我大三，做过一个课程网站，想尝试前端实习，但不知道应该先补什么。"}
                </div>
                <div className="cl-bubble cl-bubble-ai">
                  <span className="cl-ai-label">
                    {"CareerMate"}
                  </span>
                  <p data-demo-reply="">
                    {"先从你做过的事说起。这个网站里，你独立完成了哪些部分？"}
                  </p>
                  <p className="cl-chat-muted">
                    {"项目经历，是理解你能力的一个起点。"}
                  </p>
                </div>
                <span className="cl-inline-note">
                  {"示例对话 · 不会创建个人资料"}
                </span>
                <div className="v3-demo-actions">
                  <button className="v3-replay" data-replay-chat="" type="button">
                    <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                      <path d="m9 5 11 7-11 7V5Z" />
                    </svg>
                    <span>
                      {"播放对话示例"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="cl-profile-preview od-stack">
                <div className="cl-preview-label od-row">
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                  </svg>
                  <span>
                    {"逐步形成你的画像"}
                  </span>
                </div>
                <div className="cl-profile-row od-row">
                  <span>
                    {"当前阶段"}
                  </span>
                  <strong>
                    {"大三 · 探索实习"}
                  </strong>
                </div>
                <div className="cl-profile-row od-row">
                  <span>
                    {"目标方向"}
                  </span>
                  <strong>
                    {"前端开发"}
                  </strong>
                </div>
                <div className="cl-profile-row od-row">
                  <span>
                    {"已有经历"}
                  </span>
                  <strong>
                    {"课程网站项目"}
                  </strong>
                </div>
                <div className="cl-profile-row od-row">
                  <span>
                    {"继续了解"}
                  </span>
                  <strong>
                    {"项目分工与实践细节"}
                  </strong>
                </div>
                <div className="cl-confirmation od-row">
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z" />
                    <path d="m8 12 3 3 5-5" />
                  </svg>
                  <span data-confirm-status="" role="status">
                    {"由你确认，再保存为正式画像"}
                  </span>
                </div>
                <button aria-pressed="false" className="v3-confirm" data-confirm-profile="" type="button">
                  <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                  <span>
                    {"确认这份示例画像"}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div aria-labelledby="tab-explore" className="cl-feature-panel" hidden id="panel-explore" role="tabpanel" tabIndex={0}>
            <div className="cl-panel-heading">
              <div>
                <span className="cl-kicker">
                  {"探索方向"}
                </span>
                <h3>
                  {"不急着选答案，先看清可能。"}
                </h3>
              </div>
              <p>
                {"把你的背景与职业要求放在一起，"}
                <br />
                {"找到值得进一步探索的方向。"}
              </p>
            </div>
            <div className="cl-preview-grid">
              <div className="cl-explore-target od-stack">
                <span className="cl-preview-label">
                  {"方向示例"}
                </span>
                <h4 className="cl-preview-title">
                  {"前端开发"}
                </h4>
                <p>
                  {"把想法变成可以使用的界面，在交互、代码与真实需求之间找到连接。"}
                </p>
                <div className="od-cluster">
                  <span className="cl-chip">
                    {"界面实现"}
                  </span>
                  <span className="cl-chip">
                    {"交互逻辑"}
                  </span>
                  <span className="cl-chip">
                    {"工程实践"}
                  </span>
                </div>
              </div>
              <div className="cl-evidence-list od-stack">
                <div className="cl-evidence-item od-field">
                  <span className="cl-evidence-caption">
                    {"已有起点"}
                  </span>
                  <strong>
                    {"完成过课程网站"}
                  </strong>
                  <p>
                    {"继续梳理你的设计与实现贡献。"}
                  </p>
                </div>
                <div className="cl-evidence-item od-field">
                  <span className="cl-evidence-caption">
                    {"值得补充"}
                  </span>
                  <strong>
                    {"可展示的项目过程"}
                  </strong>
                  <p>
                    {"把问题、方案和验证过程讲清楚。"}
                  </p>
                </div>
                <div className="cl-evidence-item od-field">
                  <span className="cl-evidence-caption">
                    {"下一步"}
                  </span>
                  <strong>
                    {"先做一次小范围尝试"}
                  </strong>
                  <p>
                    {"通过实践与训练，判断是否适合自己。"}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div aria-labelledby="tab-plan" className="cl-feature-panel" hidden id="panel-plan" role="tabpanel" tabIndex={0}>
            <div className="cl-panel-heading">
              <div>
                <span className="cl-kicker">
                  {"把目标变成行动"}
                </span>
                <h3>
                  {"把远方，拆成今天能做的事。"}
                </h3>
              </div>
              <p>
                {"确认你的目标与时间投入，"}
                <br />
                {"再把计划落到一项项具体行动。"}
              </p>
            </div>
            <div className="cl-preview-grid">
              <div className="cl-plan-overview od-stack">
                <span className="cl-preview-label">
                  {"学习路线示例"}
                </span>
                <h4 className="cl-preview-title">
                  {"从课程项目，"}
                  <br />
                  {"到作品展示。"}
                </h4>
                <div className="cl-milestones">
                  <div className="od-field">
                    <span>
                      {"本周"}
                    </span>
                    <strong>
                      {"梳理经历"}
                    </strong>
                  </div>
                  <div className="od-field">
                    <span>
                      {"本月"}
                    </span>
                    <strong>
                      {"补足基础"}
                    </strong>
                  </div>
                  <div className="od-field">
                    <span>
                      {"下一阶段"}
                    </span>
                    <strong>
                      {"项目实践"}
                    </strong>
                  </div>
                </div>
                <p>
                  {"计划可以随着实际进度调整，不必一次走完所有步骤。"}
                </p>
              </div>
              <div className="cl-task-list od-stack">
                <div className="cl-preview-label">
                  {"试着完成一项任务"}
                </div>
                <label className="cl-task">
                  <input data-task="1" type="checkbox" />
                  <span className="od-field">
                    <strong>
                      {"整理课程项目"}
                    </strong>
                    <span>
                      {"记录目标、分工与遇到的问题"}
                    </span>
                  </span>
                </label>
                <label className="cl-task">
                  <input data-task="2" type="checkbox" />
                  <span className="od-field">
                    <strong>
                      {"复习前端基础"}
                    </strong>
                    <span>
                      {"从当前不熟悉的知识点开始"}
                    </span>
                  </span>
                </label>
                <label className="cl-task">
                  <input data-task="3" type="checkbox" />
                  <span className="od-field">
                    <strong>
                      {"练习一次项目介绍"}
                    </strong>
                    <span>
                      {"用具体经历说明你的贡献"}
                    </span>
                  </span>
                </label>
                <p aria-live="polite" className="cl-task-status" role="status">
                  {"已完成 0 / 3 项示例任务"}
                </p>
                <div aria-label="示例任务进度" aria-valuemax={3} aria-valuemin={0} aria-valuenow={0} className="v3-task-progress" data-task-progress="" role="progressbar">
                  <span />
                </div>
              </div>
            </div>
          </div>
          <div aria-labelledby="tab-train" className="cl-feature-panel" hidden id="panel-train" role="tabpanel" tabIndex={0}>
            <div className="cl-panel-heading">
              <div>
                <span className="cl-kicker">
                  {"为下一次机会做好准备"}
                </span>
                <h3>
                  {"重要的对话，可以先练习。"}
                </h3>
              </div>
              <p>
                {"选择岗位或训练情境，"}
                <br />
                {"在多轮对话后获得有针对性的反馈。"}
              </p>
            </div>
            <div className="cl-preview-grid">
              <div className="cl-train-intro od-stack">
                <span className="cl-preview-label">
                  {"训练场景示例"}
                </span>
                <h4 className="cl-preview-title">
                  {"讲清你的"}
                  <br />
                  {"第一段项目经历。"}
                </h4>
                <p>
                  {"从「做过什么」，进一步说明「为什么这样做」「遇到什么问题」「如何验证结果」。"}
                </p>
                <a className="cl-text-link" href="#practice">
                  <span>
                    {"展开训练流程"}
                  </span>
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <path d="M7 17 17 7M7 7h10v10" />
                  </svg>
                </a>
              </div>
              <div className="cl-training-outline od-stack">
                <div className="od-row">
                  <span className="cl-outline-number">
                    {"01"}
                  </span>
                  <span>
                    {"预览场景与训练目标"}
                  </span>
                </div>
                <div className="od-row">
                  <span className="cl-outline-number">
                    {"02"}
                  </span>
                  <span>
                    {"在独立会话中完成训练"}
                  </span>
                </div>
                <div className="od-row">
                  <span className="cl-outline-number">
                    {"03"}
                  </span>
                  <span>
                    {"查看评分与改进建议"}
                  </span>
                </div>
                <div className="od-row">
                  <span className="cl-outline-number">
                    {"04"}
                  </span>
                  <span>
                    {"围绕报告继续讨论"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div aria-labelledby="tab-resources" className="cl-feature-panel" hidden id="panel-resources" role="tabpanel" tabIndex={0}>
            <div className="cl-panel-heading">
              <div>
                <span className="cl-kicker">
                  {"带着目标去学习"}
                </span>
                <h3>
                  {"让学习，服务于你的下一步。"}
                </h3>
              </div>
              <p>
                {"围绕目标与能力差距，"}
                <br />
                {"查找学习资源，了解岗位样本。"}
              </p>
            </div>
            <div className="cl-preview-grid">
              <div className="cl-resource-purpose od-stack">
                <span className="cl-preview-label">
                  {"当前关注示例"}
                </span>
                <h4 className="cl-preview-title">
                  {"完善你的"}
                  <br />
                  {"前端项目。"}
                </h4>
                <p>
                  {"把需要学习的内容与具体任务关联，明确为什么学，以及学完可以做什么。"}
                </p>
                <span className="cl-chip">
                  {"关联计划"}
                </span>
              </div>
              <div className="cl-resource-list od-stack">
                <div className="cl-resource-row od-row">
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z" />
                    <path d="M8 7h8M8 11h6" />
                  </svg>
                  <div className="od-field od-fill">
                    <strong>
                      {"学习资源"}
                    </strong>
                    <span>
                      {"按主题与需求筛选资料"}
                    </span>
                  </div>
                  <span className="cl-resource-kind">
                    {"学习"}
                  </span>
                </div>
                <div className="cl-resource-row od-row">
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" />
                  </svg>
                  <div className="od-field od-fill">
                    <strong>
                      {"实践素材"}
                    </strong>
                    <span>
                      {"为当前任务寻找参考"}
                    </span>
                  </div>
                  <span className="cl-resource-kind">
                    {"实践"}
                  </span>
                </div>
                <div className="cl-resource-row od-row">
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <rect height="14" rx="2" width="18" x="3" y="7" />
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 11a20 20 0 0 0 18 0M12 11v4" />
                  </svg>
                  <div className="od-field od-fill">
                    <strong>
                      {"岗位样本"}
                    </strong>
                    <span>
                      {"了解要求与能力结构"}
                    </span>
                  </div>
                  <span className="cl-resource-kind">
                    {"探索"}
                  </span>
                </div>
                <p className="cl-inline-note">
                  {"类型示例 · 岗位样本为已导入资料，不代表实时在招。"}
                </p>
              </div>
            </div>
          </div>
          <div aria-labelledby="tab-growth" className="cl-feature-panel" hidden id="panel-growth" role="tabpanel" tabIndex={0}>
            <div className="cl-panel-heading">
              <div>
                <span className="cl-kicker">
                  {"看见自己的成长"}
                </span>
                <h3>
                  {"你走过的路，值得被看见。"}
                </h3>
              </div>
              <p>
                {"把任务、训练报告与成长记录串起来，"}
                <br />
                {"让下一次调整有迹可循。"}
              </p>
            </div>
            <div className="cl-preview-grid">
              <div className="cl-growth-timeline od-stack">
                <span className="cl-preview-label">
                  {"成长过程示例"}
                </span>
                <div className="cl-growth-item od-field">
                  <span>
                    {"认识自己"}
                  </span>
                  <strong>
                    {"整理项目经历，确认初始画像"}
                  </strong>
                </div>
                <div className="cl-growth-item od-field">
                  <span>
                    {"开始行动"}
                  </span>
                  <strong>
                    {"确认学习计划，完成第一项任务"}
                  </strong>
                </div>
                <div className="cl-growth-item od-field">
                  <span>
                    {"持续复盘"}
                  </span>
                  <strong>
                    {"结合训练反馈，调整练习重点"}
                  </strong>
                </div>
              </div>
              <div className="cl-memory-preview od-stack">
                <span className="cl-preview-label">
                  {"对你的理解，也在积累"}
                </span>
                <h4 className="cl-preview-title">
                  {"成长记录"}
                  <br />
                  {"连接下一次对话。"}
                </h4>
                <p>
                  {"查看画像、能力建议与个人记忆。你可以确认建议，让后续讨论基于自己认可的信息展开。"}
                </p>
                <div className="cl-confirmation od-row">
                  <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                    <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z" />
                    <path d="m8 12 3 3 5-5" />
                  </svg>
                  <span>
                    {"AI 提出建议，决定权始终在你"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="cl-workspace-bottom od-row">
            <span className="od-row">
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z" />
                <path d="m8 12 3 3 5-5" />
              </svg>
              <span>
                {"建议由你确认，成长由你掌握。"}
              </span>
            </span>
            <span className="cl-mono">
              {"围绕你的成长"}
            </span>
          </div>
          <span aria-live="polite" className="v3-sr" data-feature-live="" role="status" />
        </div>
      </div>
    </section>
  );
}
