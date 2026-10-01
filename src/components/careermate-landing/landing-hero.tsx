import Link from "next/link";
import { GrowthScene } from "../marketing/growth-scene";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="v2-hero" data-design="clear-path" id="main-content">
      <div className="cl-container">
        <div className="v2-hero-main">
          <div className="v2-hero-copy">
            <div className="v2-pretitle cl-enter">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
              <span>
                {"AI 职业成长伙伴"}
              </span>
            </div>
            <h1 className="v2-hero-title cl-enter cl-delay-1" id="hero-title">
              <span>
                {"未来很大。"}
              </span>
              <span>
                {"走出"}
                <em>
                  {"你的路。"}
                </em>
              </span>
            </h1>
            <p className="v2-hero-desc cl-enter cl-delay-2">
              {"从「我适合什么」，到「今天做什么」。"}
              <br />
              {"CareerMate 将画像、职业探索、行动计划与模拟训练，"}
              <br />
              {"连接成你的成长路径。"}
            </p>
            <div className="v2-hero-actions cl-enter cl-delay-3">
              <Link className="cl-button cl-button-primary" href="/login">
                {"立即开始"}
                <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M4 12h16M13 5l7 7-7 7" />
                </svg>
              </Link>
              <a className="cl-button v2-secondary" href="#features">
                <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
                </svg>
                {"探索产品能力"}
              </a>
            </div>
            <p className="v2-hero-trust cl-enter cl-delay-4">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="m12 3 9 4v5c0 5-9 9-9 9s-9-4-9-9V7l9-4Z" />
                <path d="m8 12 3 3 5-5" />
              </svg>
              <span>
                {"AI 提供建议，每一个重要决定仍由你掌握。"}
              </span>
            </p>
          </div>
          <div aria-hidden="true" className="v2-hero-note">
            {"去看更大的世界"}
            <br />
            {"也看见更好的自己"}
          </div>
          <GrowthScene />
        </div>
        <div aria-label="探索六项产品能力" className="v2-capability-strip">
          <button aria-label="查看能力画像示例" className="v2-capability" data-preview="profile" type="button">
            <span className="v2-capability-icon">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
              </svg>
            </span>
            <strong>
              {"能力画像"}
            </strong>
            <span>
              {"认识真实的自己"}
            </span>
          </button>
          <button aria-label="查看职业探索示例" className="v2-capability" data-preview="explore" type="button">
            <span className="v2-capability-icon">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
              </svg>
            </span>
            <strong>
              {"职业探索"}
            </strong>
            <span>
              {"发现更多可能"}
            </span>
          </button>
          <button aria-label="查看行动计划示例" className="v2-capability" data-preview="plan" type="button">
            <span className="v2-capability-icon">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M5 21V4M5 4c4-4 9 4 14 0v10c-5 4-10-4-14 0" />
              </svg>
            </span>
            <strong>
              {"行动计划"}
            </strong>
            <span>
              {"让目标落到今天"}
            </span>
          </button>
          <button aria-label="查看模拟训练示例" className="v2-capability" data-preview="train" type="button">
            <span className="v2-capability-icon">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
                <path d="M8 9h8M8 13h5" />
              </svg>
            </span>
            <strong>
              {"模拟训练"}
            </strong>
            <span>
              {"在实践中提升"}
            </span>
          </button>
          <button aria-label="查看学习资源示例" className="v2-capability" data-preview="resources" type="button">
            <span className="v2-capability-icon">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z" />
                <path d="M8 7h8M8 11h6" />
              </svg>
            </span>
            <strong>
              {"学习资源"}
            </strong>
            <span>
              {"带着目标去学习"}
            </span>
          </button>
          <button aria-label="查看成长记录示例" className="v2-capability" data-preview="growth" type="button">
            <span className="v2-capability-icon">
              <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17" />
              </svg>
            </span>
            <strong>
              {"成长记录"}
            </strong>
            <span>
              {"看见每一步进步"}
            </span>
          </button>
        </div>
        <div className="v2-hero-foot">
          <p>
            {"为大学生与职场新人而生 · 每一步，都更接近自己"}
          </p>
          <a className="v3-scroll-hint" href="#journey">
            <span>
              {"向下探索你的成长路径"}
            </span>
            <svg aria-hidden="true" className="v3-icon" viewBox="0 0 24 24">
              <path d="M12 4v16M5 13l7 7 7-7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
