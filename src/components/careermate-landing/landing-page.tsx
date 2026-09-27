"use client";

import { useEffect, useRef } from "react";
import "./landing-layout.css";
import styles from "./landing-page.module.css";
import { initLanding } from "./landing-motion";

/** Keep the real application authentication route. */
const LOGIN_HREF = "/login";

/** Native React introduction; effects are scoped to this root and cleaned up on unmount. */
export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return initLanding(root);
  }, []);
  return (
    <div ref={rootRef} className={[styles.landing, "cl-page"].join(" ")} id="top">
      <Header />
      <main>
        <Hero />
        <Journey />
        <FeatureShowcase />
        <TrainingShowcase />
        <GetStarted />
        <FrequentlyAsked />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <>
      <a className="cl-skip" href="#main-content">跳转到主要内容</a>
      <header className="cl-header">
        <div className="cl-nav cl-container od-row">
          <a className="cl-brand od-row" href="#top" aria-label="CareerMate 首页"><span className="cl-brand-mark"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 11a20 20 0 0 0 18 0M12 11v4"/></svg></span><span>CareerMate<span className="cl-brand-dot">.</span></span></a>
          <nav className="cl-desktop-nav od-row" aria-label="主导航"><a href="#journey" data-nav="journey">成长路径</a><a href="#features" data-nav="features">产品能力</a><a href="#practice" data-nav="practice">模拟训练</a></nav>
          <div className="cl-nav-actions od-row"><a className="cl-login od-row" href={LOGIN_HREF}>登录<span aria-hidden="true">↗</span></a><button className="cl-menu-button od-touch" type="button" aria-label="展开导航" aria-expanded="false" aria-controls="cl-mobile-nav"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div>
        </div>
        <nav className="cl-mobile-nav cl-container" id="cl-mobile-nav" aria-label="移动导航" hidden><a href="#journey">成长路径</a><a href="#features">产品能力</a><a href="#practice">模拟训练</a><a href="#start">如何开始</a></nav>
      </header>
    </>
  );
}

function Hero() {
  return (
    <>
      <section className="cl-hero cl-container" id="main-content" aria-labelledby="hero-title">
        <div className="cl-hero-main">
          <div className="cl-hero-copy">
            <div className="cl-eyebrow cl-enter cl-delay-0 od-row"><span className="cl-signal" aria-hidden="true"></span>AI 职业成长伙伴<span className="cl-eyebrow-separator">/</span><span className="cl-mono">陪你走向下一程</span></div>
            <h1 id="hero-title" className="cl-hero-title cl-enter cl-delay-1"><span>未来很大。</span><span>走出<span className="cl-title-accent">你的路。</span></span></h1>
            <p className="cl-hero-description cl-enter cl-delay-2">从「我适合什么」，到「今天做什么」。<br />CareerMate 将画像、职业探索、行动计划与模拟训练，连接成你的成长路径。</p>
            <div className="cl-hero-actions od-cluster cl-enter cl-delay-3"><a className="cl-button cl-button-primary" href={LOGIN_HREF}><span>开启成长</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a><a className="cl-text-link" href="#features"><span>探索 CareerMate</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16M5 13l7 7 7-7"/></svg></a></div>
            <p className="cl-audience cl-enter cl-delay-4"><span className="cl-small-line" aria-hidden="true"></span>为大学生与职场新人而生</p>
          </div>
          <figure className="cl-orbit cl-enter cl-delay-2" aria-label="职业轨迹示意：从探索可能，到逐步形成自己的方向">
            <div className="cl-orbit-label od-row"><span className="cl-mono">成长，有迹可循</span><span className="cl-cross" aria-hidden="true">+</span></div>
            <div className="cl-orbit-stage">
              <svg className="cl-orbit-fallback" viewBox="0 0 600 600" aria-hidden="true" fill="none"><g stroke="currentColor" strokeWidth="1"><ellipse cx="300" cy="300" rx="225" ry="105" transform="rotate(-35 300 300)"/><ellipse cx="300" cy="300" rx="225" ry="120" transform="rotate(-60 300 300)"/><ellipse cx="300" cy="300" rx="225" ry="140" transform="rotate(-85 300 300)"/><ellipse cx="300" cy="300" rx="225" ry="160" transform="rotate(-110 300 300)"/><ellipse cx="300" cy="300" rx="225" ry="180" transform="rotate(-135 300 300)"/></g><path d="M105 444C190 470 224 331 299 296S442 199 476 112" stroke="currentColor" strokeWidth="3"/><circle cx="299" cy="296" r="6" fill="currentColor"/></svg>
              <canvas className="cl-orbit-canvas" aria-hidden="true"></canvas>
              <span className="cl-orbit-tag cl-orbit-tag-start"><span className="cl-tag-dot"></span>你在这里</span>
              <span className="cl-orbit-tag cl-orbit-tag-end">下一程<svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></span>
            </div>
            <figcaption className="cl-orbit-caption od-row"><span className="cl-mono">认识自己 · 探索方向 · 持续成长</span><span className="cl-orbit-coordinates" aria-hidden="true">CareerMate</span></figcaption>
          </figure>
        </div>
        <div className="cl-hero-bottom">
          <a href="#journey" className="cl-scroll-link od-row"><span className="cl-scroll-icon" aria-hidden="true"></span><span className="cl-mono">向下探索</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16M5 13l7 7 7-7"/></svg></a>
          <div className="cl-hero-route od-row"><span>认识自己</span><span className="cl-route-rule" aria-hidden="true"></span><span>找到方向</span><span className="cl-route-rule" aria-hidden="true"></span><span>持续成长</span></div>
        </div>
      </section>
    </>
  );
}

function Journey() {
  return (
    <>
      <section className="cl-section cl-journey cl-container" id="journey" aria-labelledby="journey-title">
        <div className="cl-section-meta od-row"><span className="cl-section-number cl-mono">01 / 成长路径</span><span>让成长，有迹可循</span></div>
        <div className="cl-journey-layout">
          <div className="cl-journey-sticky cl-reveal">
            <h2 className="cl-section-title" id="journey-title">不用一次，<br />想清整个人生。<br /><em>先走好下一步。</em></h2>
            <p className="cl-section-description">职业成长不是一道单选题。<br />从你的经历出发，把模糊的期待，逐步变成能够行动的方向。</p>
            <a className="cl-text-link" href="#features"><span>看看它如何帮助你</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a>
            <div className="cl-journey-progress" aria-hidden="true"><span className="cl-journey-progress-fill"></span></div>
            <p className="cl-journey-note cl-mono">你的经历，你的成长节奏。</p>
          </div>
          <div className="cl-journey-steps">
            <article className="cl-journey-step cl-reveal" data-journey-step="0"><span className="cl-step-index cl-mono">01</span><div className="od-stack"><span className="cl-step-label">从经历出发</span><h3>先了解你，再聊未来。</h3><p>聊聊专业、项目、兴趣和目标。CareerMate 帮你整理画像，把已有积累和待补足的能力放到一起看。</p><div className="cl-step-output od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>得到：更清晰的个人画像</span></div></div></article>
            <article className="cl-journey-step cl-reveal" data-journey-step="1"><span className="cl-step-index cl-mono">02</span><div className="od-stack"><span className="cl-step-label">让选择有依据</span><h3>把可能，变成方向。</h3><p>结合你的背景探索职业，了解岗位要求、能力差距和可尝试的路线，再决定下一步往哪里走。</p><div className="cl-step-output od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>得到：职业方向与能力差距</span></div></div></article>
            <article className="cl-journey-step cl-reveal" data-journey-step="2"><span className="cl-step-index cl-mono">03</span><div className="od-stack"><span className="cl-step-label">让目标落到今天</span><h3>大目标，拆成小行动。</h3><p>将职业目标拆解为计划、学习路线和具体任务。配合学习资源与模拟训练，一步步练习需要的能力。</p><div className="cl-step-output od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>得到：可执行的成长计划</span></div></div></article>
            <article className="cl-journey-step cl-reveal" data-journey-step="3"><span className="cl-step-index cl-mono">04</span><div className="od-stack"><span className="cl-step-label">在行动中校准</span><h3>每一步，都成为下一步的线索。</h3><p>把任务进度、训练报告与成长记录串起来。回看已经完成的事，确认新的建议，让计划跟着你一起调整。</p><div className="cl-step-output od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>得到：成长记录与调整建议</span></div></div></article>
          </div>
        </div>
      </section>
    </>
  );
}

function FeatureShowcase() {
  return (
    <>
      <section className="cl-section cl-features" id="features" aria-labelledby="features-title">
        <div className="cl-container">
          <div className="cl-section-meta od-row"><span className="cl-section-number cl-mono">02 / 产品能力</span><span>探索、行动、复盘，在同一处发生</span></div>
          <div className="cl-section-heading cl-reveal"><h2 className="cl-section-title" id="features-title">一个工作台，<br /><em>接住每个成长阶段。</em></h2><p className="cl-section-description">从一段对话开始，连接你的目标、行动与反馈。<br />选择一项能力，看看你能如何使用它。</p></div>
          <div className="cl-feature-tabs" role="tablist" aria-label="CareerMate 产品能力">
            <button type="button" id="tab-profile" role="tab" aria-selected="true" aria-controls="panel-profile" data-feature="profile"><span className="cl-mono">01</span><span>能力画像</span></button>
            <button type="button" id="tab-explore" role="tab" aria-selected="false" aria-controls="panel-explore" data-feature="explore" tabIndex={-1}><span className="cl-mono">02</span><span>职业探索</span></button>
            <button type="button" id="tab-plan" role="tab" aria-selected="false" aria-controls="panel-plan" data-feature="plan" tabIndex={-1}><span className="cl-mono">03</span><span>行动计划</span></button>
            <button type="button" id="tab-train" role="tab" aria-selected="false" aria-controls="panel-train" data-feature="train" tabIndex={-1}><span className="cl-mono">04</span><span>模拟训练</span></button>
            <button type="button" id="tab-resources" role="tab" aria-selected="false" aria-controls="panel-resources" data-feature="resources" tabIndex={-1}><span className="cl-mono">05</span><span>学习资源</span></button>
            <button type="button" id="tab-growth" role="tab" aria-selected="false" aria-controls="panel-growth" data-feature="growth" tabIndex={-1}><span className="cl-mono">06</span><span>成长记录</span></button>
          </div>
          <div className="cl-workspace cl-reveal">
            <div className="cl-workspace-bar od-row"><div className="cl-workspace-brand od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 11a20 20 0 0 0 18 0M12 11v4"/></svg><span>CareerMate</span><span className="cl-divider" aria-hidden="true">/</span><span className="cl-workspace-context">我的成长空间</span></div><span className="cl-example-badge">功能示例</span></div>
            <div className="cl-feature-panel" id="panel-profile" role="tabpanel" aria-labelledby="tab-profile" tabIndex={0}>
              <div className="cl-panel-heading"><div><span className="cl-kicker">先了解你</span><h3>从一次对话，开始认识你。</h3></div><p>输入你的经历与目标，<br />整理出下一步可以讨论的能力线索。</p></div>
              <div className="cl-preview-grid">
                <div className="cl-chat-preview od-stack"><div className="cl-preview-label od-row"><span className="cl-presence"></span><span>和 CareerMate 聊一聊</span></div><div className="cl-bubble cl-bubble-user">我大三，做过一个课程网站，想尝试前端实习，但不知道应该先补什么。</div><div className="cl-bubble cl-bubble-ai"><span className="cl-ai-label">CareerMate</span><p>先从你做过的事说起。这个网站里，你独立完成了哪些部分？</p><p className="cl-chat-muted">项目经历，是理解你能力的一个起点。</p></div><span className="cl-inline-note">示例对话 · 不会创建个人资料</span></div>
                <div className="cl-profile-preview od-stack"><div className="cl-preview-label od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg><span>逐步形成你的画像</span></div><div className="cl-profile-row od-row"><span>当前阶段</span><strong>大三 · 探索实习</strong></div><div className="cl-profile-row od-row"><span>目标方向</span><strong>前端开发</strong></div><div className="cl-profile-row od-row"><span>已有经历</span><strong>课程网站项目</strong></div><div className="cl-profile-row od-row"><span>继续了解</span><strong>项目分工与实践细节</strong></div><div className="cl-confirmation od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-5"/></svg><span>由你确认，再保存为正式画像</span></div></div>
              </div>
            </div>
            <div className="cl-feature-panel" id="panel-explore" role="tabpanel" aria-labelledby="tab-explore" tabIndex={0} hidden>
              <div className="cl-panel-heading"><div><span className="cl-kicker">探索方向</span><h3>不急着选答案，先看清可能。</h3></div><p>把你的背景与职业要求放在一起，<br />找到值得进一步探索的方向。</p></div>
              <div className="cl-preview-grid"><div className="cl-explore-target od-stack"><span className="cl-preview-label">方向示例</span><h4 className="cl-preview-title">前端开发</h4><p>把想法变成可以使用的界面，在交互、代码与真实需求之间找到连接。</p><div className="od-cluster"><span className="cl-chip">界面实现</span><span className="cl-chip">交互逻辑</span><span className="cl-chip">工程实践</span></div></div><div className="cl-evidence-list od-stack"><div className="cl-evidence-item od-field"><span className="cl-evidence-caption">已有起点</span><strong>完成过课程网站</strong><p>继续梳理你的设计与实现贡献。</p></div><div className="cl-evidence-item od-field"><span className="cl-evidence-caption">值得补充</span><strong>可展示的项目过程</strong><p>把问题、方案和验证过程讲清楚。</p></div><div className="cl-evidence-item od-field"><span className="cl-evidence-caption">下一步</span><strong>先做一次小范围尝试</strong><p>通过实践与训练，判断是否适合自己。</p></div></div></div>
            </div>
            <div className="cl-feature-panel" id="panel-plan" role="tabpanel" aria-labelledby="tab-plan" tabIndex={0} hidden>
              <div className="cl-panel-heading"><div><span className="cl-kicker">把目标变成行动</span><h3>把远方，拆成今天能做的事。</h3></div><p>确认你的目标与时间投入，<br />再把计划落到一项项具体行动。</p></div>
              <div className="cl-preview-grid"><div className="cl-plan-overview od-stack"><span className="cl-preview-label">学习路线示例</span><h4 className="cl-preview-title">从课程项目，<br />到作品展示。</h4><div className="cl-milestones"><div className="od-field"><span>本周</span><strong>梳理经历</strong></div><div className="od-field"><span>本月</span><strong>补足基础</strong></div><div className="od-field"><span>下一阶段</span><strong>项目实践</strong></div></div><p>计划可以随着实际进度调整，不必一次走完所有步骤。</p></div><div className="cl-task-list od-stack"><div className="cl-preview-label">试着完成一项任务</div><label className="cl-task"><input type="checkbox" data-task="1" /><span className="od-field"><strong>整理课程项目</strong><span>记录目标、分工与遇到的问题</span></span></label><label className="cl-task"><input type="checkbox" data-task="2" /><span className="od-field"><strong>复习前端基础</strong><span>从当前不熟悉的知识点开始</span></span></label><label className="cl-task"><input type="checkbox" data-task="3" /><span className="od-field"><strong>练习一次项目介绍</strong><span>用具体经历说明你的贡献</span></span></label><p className="cl-task-status" role="status" aria-live="polite">已完成 0 / 3 项示例任务</p></div></div>
            </div>
            <div className="cl-feature-panel" id="panel-train" role="tabpanel" aria-labelledby="tab-train" tabIndex={0} hidden>
              <div className="cl-panel-heading"><div><span className="cl-kicker">为下一次机会做好准备</span><h3>重要的对话，可以先练习。</h3></div><p>选择岗位或训练情境，<br />在多轮对话后获得有针对性的反馈。</p></div>
              <div className="cl-preview-grid"><div className="cl-train-intro od-stack"><span className="cl-preview-label">训练场景示例</span><h4 className="cl-preview-title">讲清你的<br />第一段项目经历。</h4><p>从「做过什么」，进一步说明「为什么这样做」「遇到什么问题」「如何验证结果」。</p><a className="cl-text-link" href="#practice"><span>展开训练流程</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a></div><div className="cl-training-outline od-stack"><div className="od-row"><span className="cl-outline-number">01</span><span>预览场景与训练目标</span></div><div className="od-row"><span className="cl-outline-number">02</span><span>在独立会话中完成训练</span></div><div className="od-row"><span className="cl-outline-number">03</span><span>查看评分与改进建议</span></div><div className="od-row"><span className="cl-outline-number">04</span><span>围绕报告继续讨论</span></div></div></div>
            </div>
            <div className="cl-feature-panel" id="panel-resources" role="tabpanel" aria-labelledby="tab-resources" tabIndex={0} hidden>
              <div className="cl-panel-heading"><div><span className="cl-kicker">带着目标去学习</span><h3>让学习，服务于你的下一步。</h3></div><p>围绕目标与能力差距，<br />查找学习资源，了解岗位样本。</p></div>
              <div className="cl-preview-grid"><div className="cl-resource-purpose od-stack"><span className="cl-preview-label">当前关注示例</span><h4 className="cl-preview-title">完善你的<br />前端项目。</h4><p>把需要学习的内容与具体任务关联，明确为什么学，以及学完可以做什么。</p><span className="cl-chip">关联计划</span></div><div className="cl-resource-list od-stack"><div className="cl-resource-row od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z"/><path d="M8 7h8M8 11h6"/></svg><div className="od-field od-fill"><strong>学习资源</strong><span>按主题与需求筛选资料</span></div><span className="cl-resource-kind">学习</span></div><div className="cl-resource-row od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/></svg><div className="od-field od-fill"><strong>实践素材</strong><span>为当前任务寻找参考</span></div><span className="cl-resource-kind">实践</span></div><div className="cl-resource-row od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 11a20 20 0 0 0 18 0M12 11v4"/></svg><div className="od-field od-fill"><strong>岗位样本</strong><span>了解要求与能力结构</span></div><span className="cl-resource-kind">探索</span></div><p className="cl-inline-note">类型示例 · 岗位样本为已导入资料，不代表实时在招。</p></div></div>
            </div>
            <div className="cl-feature-panel" id="panel-growth" role="tabpanel" aria-labelledby="tab-growth" tabIndex={0} hidden>
              <div className="cl-panel-heading"><div><span className="cl-kicker">看见自己的成长</span><h3>你走过的路，值得被看见。</h3></div><p>把任务、训练报告与成长记录串起来，<br />让下一次调整有迹可循。</p></div>
              <div className="cl-preview-grid"><div className="cl-growth-timeline od-stack"><span className="cl-preview-label">成长过程示例</span><div className="cl-growth-item od-field"><span>认识自己</span><strong>整理项目经历，确认初始画像</strong></div><div className="cl-growth-item od-field"><span>开始行动</span><strong>确认学习计划，完成第一项任务</strong></div><div className="cl-growth-item od-field"><span>持续复盘</span><strong>结合训练反馈，调整练习重点</strong></div></div><div className="cl-memory-preview od-stack"><span className="cl-preview-label">对你的理解，也在积累</span><h4 className="cl-preview-title">成长记录<br />连接下一次对话。</h4><p>查看画像、能力建议与个人记忆。你可以确认建议，让后续讨论基于自己认可的信息展开。</p><div className="cl-confirmation od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-5"/></svg><span>AI 提出建议，决定权始终在你</span></div></div></div>
            </div>
            <div className="cl-workspace-bottom od-row"><span className="od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-5"/></svg><span>建议由你确认，成长由你掌握。</span></span><span className="cl-mono">围绕你的成长</span></div>
          </div>
        </div>
      </section>
    </>
  );
}

function TrainingShowcase() {
  return (
    <>
      <section className="cl-section cl-practice cl-container" id="practice" aria-labelledby="practice-title">
        <div className="cl-section-meta od-row"><span className="cl-section-number cl-mono">03 / 模拟训练</span><span>从一次练习，到一次进步</span></div>
        <div className="cl-practice-layout">
          <div className="cl-practice-copy cl-reveal"><span className="cl-kicker">AI 模拟训练</span><h2 className="cl-section-title" id="practice-title">把紧张，<br /><em>练成从容。</em></h2><p className="cl-section-description">在真正重要的时刻到来前，先给自己一次准备的机会。</p><p className="cl-practice-detail">预览岗位情境，完成多轮练习，再回看反馈。你不仅知道哪里可以改，也能继续讨论该怎么改。</p><div className="cl-practice-fact od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8M8 14h5"/></svg><span>支持 <span className="od-nowrap">3–6 轮</span>训练<br />至少 <span className="od-nowrap">3 轮</span>有效回答后可评分</span></div></div>
          <div className="cl-training-demo cl-reveal">
            <div className="cl-training-top od-row"><span className="od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8M8 14h5"/></svg><span>项目经历表达</span></span><span className="cl-example-badge">流程示例</span></div>
            <div className="cl-training-tabs" role="tablist" aria-label="模拟训练流程"><button type="button" id="train-tab-0" role="tab" aria-controls="train-panel-0" aria-selected="true" data-train="0"><span className="cl-mono">01</span><span>预览</span></button><button type="button" id="train-tab-1" role="tab" aria-controls="train-panel-1" aria-selected="false" data-train="1" tabIndex={-1}><span className="cl-mono">02</span><span>对话</span></button><button type="button" id="train-tab-2" role="tab" aria-controls="train-panel-2" aria-selected="false" data-train="2" tabIndex={-1}><span className="cl-mono">03</span><span>报告</span></button><button type="button" id="train-tab-3" role="tab" aria-controls="train-panel-3" aria-selected="false" data-train="3" tabIndex={-1}><span className="cl-mono">04</span><span>复盘</span></button></div>
            <div className="cl-training-stage" id="train-panel-0" role="tabpanel" aria-labelledby="train-tab-0" tabIndex={0}><span className="cl-kicker">先看清，再开始</span><h3>这次，我们聊聊你的项目。</h3><p>情境：你正在参加前端实习面试，需要介绍一个自己参与的网站项目。</p><div className="cl-training-goal od-field"><span>本次练习重点</span><strong>讲清目标、个人贡献与解决问题的过程</strong></div><p className="cl-inline-note">真实训练会保留已确认的场景，方便继续练习。</p></div>
            <div className="cl-training-stage" id="train-panel-1" role="tabpanel" aria-labelledby="train-tab-1" tabIndex={0} hidden><span className="cl-kicker">在具体情境里练习</span><h3>从「参与过」，到「说清楚」。</h3><div className="cl-mini-dialogue od-stack"><div className="cl-bubble cl-bubble-ai"><span className="cl-ai-label">面试官</span><p>请介绍这个网站里你独立负责的部分，以及遇到的一个具体问题。</p></div><div className="cl-bubble cl-bubble-user">我负责列表页。数据较多时操作不流畅，我先定位了重复更新，再调整了交互处理。</div></div><p className="cl-inline-note">对话节选示例 · 真实训练在独立会话中进行。</p></div>
            <div className="cl-training-stage" id="train-panel-2" role="tabpanel" aria-labelledby="train-tab-2" tabIndex={0} hidden><span className="cl-kicker">让反馈具体一些</span><h3>看见亮点，也看见下一步。</h3><div className="cl-feedback-item od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><div className="od-field"><strong>值得保留</strong><span>说明了个人负责的范围与问题。</span></div></div><div className="cl-feedback-item od-row"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg><div className="od-field"><strong>还可以补充</strong><span>交代如何定位问题、比较方案和验证改善。</span></div></div><p className="cl-inline-note">反馈结构示例。真实评分基于已完成的有效回答。</p></div>
            <div className="cl-training-stage" id="train-panel-3" role="tabpanel" aria-labelledby="train-tab-3" tabIndex={0} hidden><span className="cl-kicker">把反馈变成行动</span><h3>报告之后，对话继续。</h3><div className="cl-bubble cl-bubble-user">我应该如何把「验证改善」讲得更清楚？</div><div className="cl-bubble cl-bubble-ai"><span className="cl-ai-label">CareerMate</span><p>可以依次说明验证条件、观察方法与结果。如果暂时缺少证据，先补一次可复现的验证。</p></div><p className="cl-inline-note">结合报告继续讨论，形成下一次练习的重点。</p></div>
            <div className="cl-training-controls od-row"><button className="cl-previous od-touch" type="button" data-train-prev aria-label="上一个训练阶段" disabled><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12H4M11 5l-7 7 7 7"/></svg></button><span className="cl-training-counter cl-mono" aria-live="polite">01 / 04</span><button className="cl-next-stage" type="button" data-train-next><span>看看如何对话</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16M13 5l7 7-7 7"/></svg></button></div>
          </div>
        </div>
      </section>
    </>
  );
}

function GetStarted() {
  return (
    <>
      <section className="cl-section cl-start cl-container" id="start" aria-labelledby="start-title">
        <div className="cl-section-meta od-row"><span className="cl-section-number cl-mono">04 / 开始使用</span><span>不必准备好一切，才开始</span></div>
        <div className="cl-section-heading cl-reveal"><h2 className="cl-section-title" id="start-title">从你的故事，<br /><em>开启下一程。</em></h2><p className="cl-section-description">你带来经历、困惑与期待。<br />我们一起，把下一步理清楚。</p></div>
        <div className="cl-start-grid"><article className="cl-start-step cl-reveal"><span className="cl-start-number cl-mono">01<span aria-hidden="true">↗</span></span><h3>登录工作台</h3><p>创建账号或登录 CareerMate，进入属于你的成长空间。</p></article><article className="cl-start-step cl-reveal"><span className="cl-start-number cl-mono">02<span aria-hidden="true">↗</span></span><h3>聊聊你的经历</h3><p>在对话中补充背景与目标，逐步整理并确认个人画像。</p></article><article className="cl-start-step cl-reveal"><span className="cl-start-number cl-mono">03<span aria-hidden="true">↗</span></span><h3>确认第一份计划</h3><p>讨论适合自己的方向，确认建议，然后从一项具体行动开始。</p></article></div>
      </section>
    </>
  );
}

function FrequentlyAsked() {
  return (
    <>
      <section className="cl-section cl-faq cl-container" id="questions" aria-labelledby="faq-title"><div className="cl-faq-layout"><div className="cl-reveal"><span className="cl-section-number cl-mono">常见问题</span><h2 className="cl-section-title" id="faq-title">开始之前，<br /><em>你也许想知道。</em></h2></div><div className="cl-faq-list">
        <details><summary><span>还没确定职业方向，也可以用吗？</span><span className="cl-faq-plus" aria-hidden="true">+</span></summary><div className="cl-faq-answer"><p>可以。你可以先从专业、兴趣和已有经历聊起，逐步了解不同职业的要求。探索本身就是成长过程的一部分，不需要先有一个确定答案。</p></div></details>
        <details><summary><span>AI 会替我决定职业和计划吗？</span><span className="cl-faq-plus" aria-hidden="true">+</span></summary><div className="cl-faq-answer"><p>CareerMate 提供分析与建议，你掌握决定权。AI 生成的画像、计划或能力建议需要经过你的确认，才会进入正式业务记录。你也可以继续讨论并调整。</p></div></details>
        <details><summary><span>模拟训练具体怎么进行？</span><span className="cl-faq-plus" aria-hidden="true">+</span></summary><div className="cl-faq-answer"><p>先选择推荐、自定义或岗位场景并预览，开始后在独立会话中训练。训练轮数上限可设为 3–6 轮，默认 6 轮；至少完成 3 轮有效回答后可评分，结束后可以围绕报告继续讨论。</p></div></details>
        <details><summary><span>岗位样本就是正在招聘的职位吗？</span><span className="cl-faq-plus" aria-hidden="true">+</span></summary><div className="cl-faq-answer"><p>不是。这里的岗位样本来自已导入的资料，用于了解职业要求与能力结构，不代表实时在招。实际招聘状态需要以招聘方发布的信息为准。</p></div></details>
      </div></div></section>
    </>
  );
}

function Closing() {
  return (
    <>
      <section className="cl-closing" aria-labelledby="closing-title"><div className="cl-container"><div className="cl-closing-top od-row"><span className="cl-section-number cl-mono">一起，开启下一程</span><span className="cl-closing-spark" aria-hidden="true"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5"/></svg></span></div><div className="cl-closing-main"><h2 className="cl-closing-title cl-reveal" id="closing-title">下一程，<br /><em>从现在开始。</em></h2><div className="cl-closing-action od-stack"><p>把期待，变成方向。<br />把方向，变成行动。</p><a className="cl-button cl-button-primary" href={LOGIN_HREF}><span>开启我的成长</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a></div></div></div></section>
    </>
  );
}

function Footer() {
  return (
    <>
      <footer className="cl-footer cl-container"><div className="cl-footer-top od-row"><a className="cl-brand od-row" href="#top"><span className="cl-brand-mark"><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 11a20 20 0 0 0 18 0M12 11v4"/></svg></span><span>CareerMate<span className="cl-brand-dot">.</span></span></a><p>与每一个正在成长的你同行。</p><a className="cl-back-top cl-text-link" href="#top"><span>回到顶部</span><svg className="cl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a></div><div className="cl-footer-bottom od-row"><span>© 2026 CareerMate</span><span>AI 职业成长伙伴</span><span className="cl-mono">持续探索，持续成长。</span></div></footer>
    </>
  );
}
