export function TrainingShowcase() {
  return (
    <section aria-labelledby="practice-title" className="cl-section cl-practice cl-container" id="practice">
      <div className="cl-section-meta od-row">
        <span className="cl-section-number cl-mono">
          {"03 / 模拟训练"}
        </span>
        <span>
          {"从一次练习，到一次进步"}
        </span>
      </div>
      <div className="cl-practice-layout">
        <div className="cl-practice-copy cl-reveal">
          <span className="cl-kicker">
            {"AI 模拟训练"}
          </span>
          <h2 className="cl-section-title" id="practice-title">
            {"把紧张，"}
            <br />
            <em>
              {"练成从容。"}
            </em>
          </h2>
          <p className="cl-section-description">
            {"在真正重要的时刻到来前，先给自己一次准备的机会。"}
          </p>
          <p className="cl-practice-detail">
            {"预览岗位情境，完成多轮练习，再回看反馈。你不仅知道哪里可以改，也能继续讨论该怎么改。"}
          </p>
          <div className="cl-practice-fact od-row">
            <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
              <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
              <path d="M8 10h8M8 14h5" />
            </svg>
            <span>
              {"支持"}
              <span className="od-nowrap">
                {"3–6 轮"}
              </span>
              {"训练"}
              <br />
              {"至少"}
              <span className="od-nowrap">
                {"3 轮"}
              </span>
              {"有效回答后可评分"}
            </span>
          </div>
        </div>
        <div className="cl-training-demo cl-reveal">
          <div className="cl-training-top od-row">
            <span className="od-row">
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
                <path d="M8 10h8M8 14h5" />
              </svg>
              <span>
                {"项目经历表达"}
              </span>
            </span>
            <span className="cl-example-badge">
              {"流程示例"}
            </span>
          </div>
          <div aria-label="模拟训练流程" className="cl-training-tabs" role="tablist">
            <button aria-controls="train-panel-0" aria-selected="true" data-train="0" id="train-tab-0" role="tab" type="button">
              <span className="cl-mono">
                {"01"}
              </span>
              <span>
                {"预览"}
              </span>
            </button>
            <button aria-controls="train-panel-1" aria-selected="false" data-train="1" id="train-tab-1" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"02"}
              </span>
              <span>
                {"对话"}
              </span>
            </button>
            <button aria-controls="train-panel-2" aria-selected="false" data-train="2" id="train-tab-2" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"03"}
              </span>
              <span>
                {"报告"}
              </span>
            </button>
            <button aria-controls="train-panel-3" aria-selected="false" data-train="3" id="train-tab-3" role="tab" tabIndex={-1} type="button">
              <span className="cl-mono">
                {"04"}
              </span>
              <span>
                {"复盘"}
              </span>
            </button>
          </div>
          <div aria-labelledby="train-tab-0" className="cl-training-stage" id="train-panel-0" role="tabpanel" tabIndex={0}>
            <span className="cl-kicker">
              {"先看清，再开始"}
            </span>
            <h3>
              {"这次，我们聊聊你的项目。"}
            </h3>
            <p>
              {"情境：你正在参加前端实习面试，需要介绍一个自己参与的网站项目。"}
            </p>
            <div className="cl-training-goal od-field">
              <span>
                {"本次练习重点"}
              </span>
              <strong>
                {"讲清目标、个人贡献与解决问题的过程"}
              </strong>
            </div>
            <p className="cl-inline-note">
              {"真实训练会保留已确认的场景，方便继续练习。"}
            </p>
          </div>
          <div aria-labelledby="train-tab-1" className="cl-training-stage" hidden id="train-panel-1" role="tabpanel" tabIndex={0}>
            <span className="cl-kicker">
              {"在具体情境里练习"}
            </span>
            <h3>
              {"从「参与过」，到「说清楚」。"}
            </h3>
            <div className="cl-mini-dialogue od-stack">
              <div className="cl-bubble cl-bubble-ai">
                <span className="cl-ai-label">
                  {"面试官"}
                </span>
                <p>
                  {"请介绍这个网站里你独立负责的部分，以及遇到的一个具体问题。"}
                </p>
              </div>
              <div className="cl-bubble cl-bubble-user">
                {"我负责列表页。数据较多时操作不流畅，我先定位了重复更新，再调整了交互处理。"}
              </div>
            </div>
            <p className="cl-inline-note">
              {"对话节选示例 · 真实训练在独立会话中进行。"}
            </p>
          </div>
          <div aria-labelledby="train-tab-2" className="cl-training-stage" hidden id="train-panel-2" role="tabpanel" tabIndex={0}>
            <span className="cl-kicker">
              {"让反馈具体一些"}
            </span>
            <h3>
              {"看见亮点，也看见下一步。"}
            </h3>
            <div className="cl-feedback-item od-row">
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="m5 12 4 4L19 6" />
              </svg>
              <div className="od-field">
                <strong>
                  {"值得保留"}
                </strong>
                <span>
                  {"说明了个人负责的范围与问题。"}
                </span>
              </div>
            </div>
            <div className="cl-feedback-item od-row">
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
              <div className="od-field">
                <strong>
                  {"还可以补充"}
                </strong>
                <span>
                  {"交代如何定位问题、比较方案和验证改善。"}
                </span>
              </div>
            </div>
            <p className="cl-inline-note">
              {"反馈结构示例。真实评分基于已完成的有效回答。"}
            </p>
          </div>
          <div aria-labelledby="train-tab-3" className="cl-training-stage" hidden id="train-panel-3" role="tabpanel" tabIndex={0}>
            <span className="cl-kicker">
              {"把反馈变成行动"}
            </span>
            <h3>
              {"报告之后，对话继续。"}
            </h3>
            <div className="cl-bubble cl-bubble-user">
              {"我应该如何把「验证改善」讲得更清楚？"}
            </div>
            <div className="cl-bubble cl-bubble-ai">
              <span className="cl-ai-label">
                {"CareerMate"}
              </span>
              <p>
                {"可以依次说明验证条件、观察方法与结果。如果暂时缺少证据，先补一次可复现的验证。"}
              </p>
            </div>
            <p className="cl-inline-note">
              {"结合报告继续讨论，形成下一次练习的重点。"}
            </p>
          </div>
          <div className="cl-training-controls od-row">
            <button aria-label="上一个训练阶段" className="cl-previous od-touch" data-train-prev="" disabled type="button">
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M20 12H4M11 5l-7 7 7 7" />
              </svg>
            </button>
            <span aria-live="polite" className="cl-training-counter cl-mono">
              {"01 / 04"}
            </span>
            <button className="cl-next-stage" data-train-next="" type="button">
              <span>
                {"看看如何对话"}
              </span>
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M4 12h16M13 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="v3-training-tools">
            <span>
              {"流程示例，不调用实时 AI"}
            </span>
            <button aria-pressed="false" className="v3-autoplay" data-training-play="" type="button">
              <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                <path d="m9 5 11 7-11 7V5Z" />
              </svg>
              <span>
                {"自动演示"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
