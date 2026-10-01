"use client";

import { BrandMark } from "@/components/brand-mark";
import Link from "next/link";
import { GetStarted, FrequentlyAsked, Closing } from "./landing-sections";
import { TrainingShowcase } from "./landing-training";
import { FeatureShowcase } from "./landing-features";
import { Journey } from "./landing-journey";
import { Hero } from "./landing-hero";
import { useEffect, useRef } from "react";
import styles from "./landing-page.module.css";
import { initMarketingMotion } from "../marketing/marketing-motion";
import { initLanding } from "./landing-motion";

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stopMotion = initMarketingMotion(root);
    const stopInteractions = initLanding(root);
    return () => { stopInteractions(); stopMotion(); };
  }, []);
  return (
    <div ref={rootRef} className={[styles.page, "cl-page"].join(" ")} id="top" data-motion-mode="full">
      <div aria-hidden="true" className="v3-scroll-progress">
        <span />
      </div>
      <div aria-hidden="true" className="cl-ambient-background">
        <div className="cl-ambient-bg-grid" />
        <div className="cl-ambient-bg-glow" />
      </div>
      <a className="cl-skip" href="#main-content">
        {"跳转到主要内容"}
      </a>
      <header className="cl-header">
        <div className="cl-nav cl-container od-row">
          <a aria-label="CareerMate 首页" className="cl-brand od-row" href="#top">
            <BrandMark className="v2-logo" />
            <span>
              {"CareerMate"}
            </span>
          </a>
          <nav aria-label="主导航" className="cl-desktop-nav od-row">
            <a aria-current="location" data-nav="main-content" href="#main-content">
              {"首页"}
            </a>
            <a data-nav="journey" href="#journey">
              {"成长路径"}
            </a>
            <a data-nav="features" href="#features">
              {"产品能力"}
            </a>
            <a data-nav="practice" href="#practice">
              {"模拟训练"}
            </a>
          </nav>
          <div className="cl-nav-actions od-row">
            <Link className="cl-login od-row" href="/login">
              {"登录"}
            </Link>
            <Link className="cl-button cl-button-primary v2-nav-cta" href="/login">
              {"立即开始"}
            </Link>
            <button aria-controls="cl-mobile-nav" aria-expanded="false" aria-label="展开导航" className="cl-menu-button od-touch" type="button">
              <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
        <nav aria-label="移动导航" className="cl-mobile-nav cl-container" hidden id="cl-mobile-nav">
          <a href="#journey">
            {"成长路径"}
          </a>
          <a href="#features">
            {"产品能力"}
          </a>
          <a href="#practice">
            {"模拟训练"}
          </a>
          <a href="#start">
            {"如何开始"}
          </a>
        </nav>
      </header>
      <main>
        <Hero />
        <Journey />
        <FeatureShowcase />
        <TrainingShowcase />
        <GetStarted />
        <FrequentlyAsked />
        <Closing />
      </main>
      <footer className="cl-footer cl-container">
        <div className="cl-footer-top od-row">
          <a className="cl-brand od-row" href="#top">
            <BrandMark className="v2-logo" />
            <span>
              {"CareerMate"}
            </span>
          </a>
          <p>
            {"与每一个正在成长的你同行。"}
          </p>
          <a className="cl-back-top cl-text-link" href="#top">
            <span>
              {"回到顶部"}
            </span>
            <svg aria-hidden="true" className="cl-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>
        </div>
        <div className="cl-footer-bottom od-row">
          <span>
            {"© 2026 CareerMate"}
          </span>
          <span>
            {"AI 职业成长伙伴"}
          </span>
          <span className="cl-mono">
            {"持续探索，持续成长。"}
          </span>
        </div>
      </footer>
    </div>
  );
}
