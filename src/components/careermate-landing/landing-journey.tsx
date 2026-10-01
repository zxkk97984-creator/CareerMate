export function Journey() {
  return (
    <section aria-labelledby="journey-title" className="cl-section cl-journey cl-container" id="journey">
      <div className="cl-section-meta od-row">
        <span className="cl-section-number cl-mono">
          {"01 / 成长路径"}
        </span>
        <span>
          {"让成长，有迹可循"}
        </span>
      </div>
      <div className="cl-journey-layout">
        <div className="cl-journey-sticky cl-reveal">
          <h2 className="cl-section-title" id="journey-title">
            {"不用一次，"}
            <br />
            {"想清整个人生。"}
            <br />
            <em>
              {"先走好下一步。"}
            </em>
          </h2>
          <p className="cl-section-description">
            {"职业成长不是一道单选题。"}
            <br />
            {"从你的经历出发，把模糊的期待，逐步变成能够行动的方向。"}
          </p>
          <a className="cl-text-link" href="#features">
            <span>
              {"看看它如何帮助你"}
            </span>
            <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>
          <div aria-hidden="true" className="cl-journey-progress">
            <span className="cl-journey-progress-fill" />
          </div>
          <p className="cl-journey-note cl-mono">
            {"你的经历，你的成长节奏。"}
          </p>
          <div className="v3-intents">
            <p>
              {"你现在更想解决什么？"}
            </p>
            <button className="v3-intent" data-preview="explore" type="button">
              <span>
                {"还没有方向，想先看清可能"}
              </span>
              <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                <path d="M4 12h16M13 5l7 7-7 7" />
              </svg>
            </button>
            <button className="v3-intent" data-preview="plan" type="button">
              <span>
                {"有了目标，不知道从哪里开始"}
              </span>
              <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                <path d="M4 12h16M13 5l7 7-7 7" />
              </svg>
            </button>
            <button className="v3-intent" data-preview="train" type="button">
              <span>
                {"机会在眼前，想先练习一次"}
              </span>
              <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                <path d="M4 12h16M13 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        <div className="cl-journey-steps">
          <article className="cl-journey-step cl-reveal" data-journey-step="0">
            <span className="cl-step-index cl-mono">
              {"01"}
            </span>
            <div className="od-stack">
              <span className="cl-step-label">
                {"从经历出发"}
              </span>
              <h3>
                {"先了解你，再聊未来。"}
              </h3>
              <p>
                {"聊聊专业、项目、兴趣和目标。CareerMate 帮你整理画像，把已有积累和待补足的能力放到一起看。"}
              </p>
              <div className="cl-step-output od-row">
                <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" />
                </svg>
                <span>
                  {"得到：更清晰的个人画像"}
                </span>
              </div>
              <button className="v3-step-link" data-preview="profile" type="button">
                <span>
                  {"看看画像示例"}
                </span>
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M4 12h16M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </article>
          <article className="cl-journey-step cl-reveal" data-journey-step="1">
            <span className="cl-step-index cl-mono">
              {"02"}
            </span>
            <div className="od-stack">
              <span className="cl-step-label">
                {"让选择有依据"}
              </span>
              <h3>
                {"把可能，变成方向。"}
              </h3>
              <p>
                {"结合你的背景探索职业，了解岗位要求、能力差距和可尝试的路线，再决定下一步往哪里走。"}
              </p>
              <div className="cl-step-output od-row">
                <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" />
                </svg>
                <span>
                  {"得到：职业方向与能力差距"}
                </span>
              </div>
              <button className="v3-step-link" data-preview="explore" type="button">
                <span>
                  {"看看职业探索"}
                </span>
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M4 12h16M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </article>
          <article className="cl-journey-step cl-reveal" data-journey-step="2">
            <span className="cl-step-index cl-mono">
              {"03"}
            </span>
            <div className="od-stack">
              <span className="cl-step-label">
                {"让目标落到今天"}
              </span>
              <h3>
                {"大目标，拆成小行动。"}
              </h3>
              <p>
                {"将职业目标拆解为计划、学习路线和具体任务。配合学习资源与模拟训练，一步步练习需要的能力。"}
              </p>
              <div className="cl-step-output od-row">
                <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" />
                </svg>
                <span>
                  {"得到：可执行的成长计划"}
                </span>
              </div>
              <button className="v3-step-link" data-preview="plan" type="button">
                <span>
                  {"试试行动计划"}
                </span>
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M4 12h16M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </article>
          <article className="cl-journey-step cl-reveal" data-journey-step="3">
            <span className="cl-step-index cl-mono">
              {"04"}
            </span>
            <div className="od-stack">
              <span className="cl-step-label">
                {"在行动中校准"}
              </span>
              <h3>
                {"每一步，都成为下一步的线索。"}
              </h3>
              <p>
                {"把任务进度、训练报告与成长记录串起来。回看已经完成的事，确认新的建议，让计划跟着你一起调整。"}
              </p>
              <div className="cl-step-output od-row">
                <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                  <path d="m5 12 4 4L19 6" />
                </svg>
                <span>
                  {"得到：成长记录与调整建议"}
                </span>
              </div>
              <button className="v3-step-link" data-preview="growth" type="button">
                <span>
                  {"回看成长记录"}
                </span>
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M4 12h16M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
