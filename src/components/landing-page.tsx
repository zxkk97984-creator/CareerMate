import Link from "next/link";
import { LandingMotion } from "@/components/landing-motion";
import { InteractiveBackground } from "@/components/interactive-background";
import {
  ArrowRight,
  BriefcaseBusiness,
  Layers,
  Map,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    icon: BriefcaseBusiness,
    title: "动态能力画像",
    desc: "AI 根据教育、项目与训练表现，持续更新能力标签与短板。",
  },
  {
    icon: Map,
    title: "3 年职业路径",
    desc: "按月拆解目标，季度里程碑，定期复盘并生成调整建议。",
  },
  {
    icon: MessageSquareText,
    title: "AI 模拟面试",
    desc: "按目标岗位生成 6 轮情境面试，输出评分与改进清单。",
  },
];

const steps = [
  { icon: Layers, title: "完善画像", desc: "2 分钟告诉 AI 你的专业、目标与时间投入" },
  { icon: TrendingUp, title: "生成路径", desc: "获得可执行的 3 年职业成长计划" },
  { icon: ShieldCheck, title: "模拟训练", desc: "用岗位化面试与训练校准能力，补齐短板" },
];

export function LandingPage() {
  return (
    <main className="landing-new">
      <InteractiveBackground />
      {/* 背景装饰：斜向方块 */}
      <span className="landing-shape landing-shape-1" aria-hidden="true" />

      {/* 导航 */}
      <nav className="landing-new-nav">
        <Link href="/" className="landing-new-logo">
          <span className="landing-new-logo-icon">
            <BriefcaseBusiness size={18} />
          </span>
          <span>CareerMate</span>
        </Link>
        <div className="landing-new-nav-links">
          <a href="#features">功能</a>
          <a href="#steps">怎么用</a>
        </div>
        <div className="landing-new-nav-actions">
          <Link href="/login" className="landing-new-login">登录</Link>
        </div>
      </nav>

      {/* Hero */}
      <LandingMotion>
      <section className="landing-new-hero">
        <div className="landing-new-hero-copy">
          <div className="landing-new-badge">
            <Sparkles size={14} />
            AI 职业成长伙伴
          </div>
          <h1 className="landing-new-title">
            让职业规划<span className="landing-new-accent">更简单</span>
            <br />
            每一步都更清晰
          </h1>
          <p className="landing-new-subtitle">
            动态能力画像、3 年职业路径、AI 模拟面试与学习资源推荐，一个平台陪你走完从校园到职场的关键几年。
          </p>
          <div className="landing-new-actions">
            <Link href="/login" className="landing-new-primary">
              登录 CareerMate
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="landing-new-stats">
            <div className="landing-new-stat">
              <strong>6 轮</strong>
              <span>岗位模拟面试</span>
            </div>
            <div className="landing-new-stat">
              <strong>3 年</strong>
              <span>职业路径规划</span>
            </div>
            <div className="landing-new-stat">
              <strong>12+</strong>
              <span>能力维度追踪</span>
            </div>
          </div>
        </div>

        {/* 右侧装饰卡片组 */}
        <div className="landing-new-art" aria-hidden="true">
          <div className="landing-art-card landing-art-card-1">
            <span className="landing-art-card-label">能力画像</span>
            <span className="landing-art-card-value">85</span>
            <span className="landing-art-card-tag">目标岗位匹配度</span>
          </div>
          <div className="landing-art-card landing-art-card-2">
            <span className="landing-art-card-label">3 年路径</span>
            <span className="landing-art-card-dots"><i /><i /><i /><i /></span>
            <span className="landing-art-card-tag">季度里程碑</span>
          </div>
          <div className="landing-art-card landing-art-card-3">
            <span className="landing-art-card-label">模拟面试</span>
            <span className="landing-art-card-score">B+</span>
            <span className="landing-art-card-tag">持续提升中</span>
          </div>

        </div>
      </section>
      </LandingMotion>

      {/* 功能卡片 */}
      <section className="landing-new-section" id="features">
        <div className="landing-new-section-head">
          <h2>一个平台，覆盖职业成长关键环节</h2>
          <p>从认识自己，到规划路径，再到模拟训练，CareerMate 全程陪伴。</p>
        </div>
        <div className="landing-new-features">
          {features.map((f) => (
            <div className="landing-new-feature-card" key={f.title}>
              <span className="landing-new-feature-icon">
                <f.icon size={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 三步使用 */}
      <section className="landing-new-section landing-new-steps" id="steps">
        <div className="landing-new-section-head">
          <h2>三步开始成长</h2>
        </div>
        <div className="landing-new-step-list">
          {steps.map((s, i) => (
            <div className="landing-new-step" key={s.title}>
              <span className="landing-new-step-num">0{i + 1}</span>
              <span className="landing-new-step-icon">
                <s.icon size={18} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="landing-new-cta">
        <div className="landing-new-cta-card">
          <h2>准备好开始你的职业成长了吗？</h2>
          <p>免费登录，2 分钟完成画像，马上获得第一份路径建议。</p>
          <Link href="/login" className="landing-new-primary">
            登录 CareerMate
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="landing-new-footer">
        <span>CareerMate</span>
        <span>AI 职业成长伙伴 · 为高校生与职场新人而生</span>
      </footer>
    </main>
  );
}
