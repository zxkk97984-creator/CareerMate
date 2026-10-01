import Link from "next/link";
export function GetStarted() {
  return (
    <section aria-labelledby="start-title" className="cl-section cl-start cl-container" id="start">
      <div className="cl-section-meta od-row">
        <span className="cl-section-number cl-mono">
          {"04 / 开始使用"}
        </span>
        <span>
          {"不必准备好一切，才开始"}
        </span>
      </div>
      <div className="cl-section-heading cl-reveal">
        <h2 className="cl-section-title" id="start-title">
          {"从你的故事，"}
          <br />
          <em>
            {"开启下一程。"}
          </em>
        </h2>
        <p className="cl-section-description">
          {"你带来经历、困惑与期待。"}
          <br />
          {"我们一起，把下一步理清楚。"}
        </p>
      </div>
      <div className="cl-start-grid">
        <article className="cl-start-step cl-reveal">
          <span className="cl-start-number cl-mono">
            {"01"}
            <span aria-hidden="true">
              {"↗"}
            </span>
          </span>
          <h3>
            {"登录工作台"}
          </h3>
          <p>
            {"创建账号或登录 CareerMate，进入属于你的成长空间。"}
          </p>
        </article>
        <article className="cl-start-step cl-reveal">
          <span className="cl-start-number cl-mono">
            {"02"}
            <span aria-hidden="true">
              {"↗"}
            </span>
          </span>
          <h3>
            {"聊聊你的经历"}
          </h3>
          <p>
            {"在对话中补充背景与目标，逐步整理并确认个人画像。"}
          </p>
        </article>
        <article className="cl-start-step cl-reveal">
          <span className="cl-start-number cl-mono">
            {"03"}
            <span aria-hidden="true">
              {"↗"}
            </span>
          </span>
          <h3>
            {"确认第一份计划"}
          </h3>
          <p>
            {"讨论适合自己的方向，确认建议，然后从一项具体行动开始。"}
          </p>
        </article>
      </div>
    </section>
  );
}


export function FrequentlyAsked() {
  return (
    <section aria-labelledby="faq-title" className="cl-section cl-faq cl-container" id="questions">
      <div className="cl-faq-layout">
        <div className="cl-reveal">
          <span className="cl-section-number cl-mono">
            {"常见问题"}
          </span>
          <h2 className="cl-section-title" id="faq-title">
            {"开始之前，"}
            <br />
            <em>
              {"你也许想知道。"}
            </em>
          </h2>
        </div>
        <div className="cl-faq-list">
          <details>
            <summary>
              <span>
                {"还没确定职业方向，也可以用吗？"}
              </span>
              <span aria-hidden="true" className="cl-faq-plus">
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </summary>
            <div className="cl-faq-answer">
              <p>
                {"可以。你可以先从专业、兴趣和已有经历聊起，逐步了解不同职业的要求。探索本身就是成长过程的一部分，不需要先有一个确定答案。"}
              </p>
            </div>
          </details>
          <details>
            <summary>
              <span>
                {"AI 会替我决定职业和计划吗？"}
              </span>
              <span aria-hidden="true" className="cl-faq-plus">
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </summary>
            <div className="cl-faq-answer">
              <p>
                {"CareerMate 提供分析与建议，你掌握决定权。AI 生成的画像、计划或能力建议需要经过你的确认，才会进入正式业务记录。你也可以继续讨论并调整。"}
              </p>
            </div>
          </details>
          <details>
            <summary>
              <span>
                {"模拟训练具体怎么进行？"}
              </span>
              <span aria-hidden="true" className="cl-faq-plus">
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </summary>
            <div className="cl-faq-answer">
              <p>
                {"先选择推荐、自定义或岗位场景并预览，开始后在独立会话中训练。训练轮数上限可设为 3–6 轮，默认 6 轮；至少完成 3 轮有效回答后可评分，结束后可以围绕报告继续讨论。"}
              </p>
            </div>
          </details>
          <details>
            <summary>
              <span>
                {"岗位样本就是正在招聘的职位吗？"}
              </span>
              <span aria-hidden="true" className="cl-faq-plus">
                <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </summary>
            <div className="cl-faq-answer">
              <p>
                {"不是。这里的岗位样本来自已导入的资料，用于了解职业要求与能力结构，不代表实时在招。实际招聘状态需要以招聘方发布的信息为准。"}
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}


export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="cl-closing">
      <div className="cl-container">
        <div className="cl-closing-top od-row">
          <span className="cl-section-number cl-mono">
            {"一起，开启下一程"}
          </span>
          <span aria-hidden="true" className="cl-closing-spark">
            <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
              <path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5" />
            </svg>
          </span>
        </div>
        <div className="cl-closing-main">
          <h2 className="cl-closing-title cl-reveal" id="closing-title">
            {"下一程，"}
            <br />
            <em>
              {"从现在开始。"}
            </em>
          </h2>
          <div className="cl-closing-action od-stack">
            <p>
              {"把期待，变成方向。"}
              <br />
              {"把方向，变成行动。"}
            </p>
            <Link className="cl-button cl-button-primary" href="/login">
              <span>
                {"开启我的成长"}
              </span>
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
