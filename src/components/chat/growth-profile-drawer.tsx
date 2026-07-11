"use client";

import { X, TrendingUp, Brain, Target, Clock } from "lucide-react";

interface GrowthProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  pendingCandidateCount: number;
}

export function GrowthProfileDrawer({ open, onClose, pendingCandidateCount }: GrowthProfileDrawerProps) {
  return (
    <aside className={`growth-drawer ${open ? "drawer-open" : ""}`} aria-label="成长档案">
      <div className="drawer-header">
        <h2 className="drawer-title">成长档案</h2>
        <button className="drawer-close" onClick={onClose} aria-label="收起成长档案">
          <X size={18} />
        </button>
      </div>

      <div className="drawer-content">
        {/* 待确认候选 */}
        {pendingCandidateCount > 0 && (
          <div className="drawer-section drawer-pending">
            <div className="section-header">
              <Brain size={18} />
              <span>待确认</span>
              <span className="pending-count">{pendingCandidateCount}</span>
            </div>
            <p className="section-desc">
              AI 从聊天中发现了 {pendingCandidateCount} 项画像更新建议，请确认后生效。
            </p>
          </div>
        )}

        {pendingCandidateCount === 0 && (
          <div className="drawer-section drawer-ok">
            <div className="section-header">
              <Target size={18} />
              <span>画像状态</span>
            </div>
            <p className="section-desc">暂无需确认的更新建议。继续聊天，AI 会自动发现你的成长变化。</p>
          </div>
        )}

        {/* 快速入口 */}
        <div className="drawer-section">
          <div className="section-header">
            <TrendingUp size={18} />
            <span>快速入口</span>
          </div>
          <nav className="drawer-nav">
            <a href="/dashboard" className="drawer-nav-item">成长概览</a>
            <a href="/path" className="drawer-nav-item">职业路径</a>
            <a href="/simulation" className="drawer-nav-item">模拟训练</a>
            <a href="/resources" className="drawer-nav-item">资源中心</a>
            <a href="/memory" className="drawer-nav-item">记忆权限</a>
          </nav>
        </div>

        {/* 使用提示 */}
        <div className="drawer-section drawer-tips">
          <div className="section-header">
            <Clock size={18} />
            <span>提示</span>
          </div>
          <ul className="tips-list">
            <li>聊天中 AI 只能提出画像候选，需你确认后才生效</li>
            <li>职业计划更新也会先展示差异，由你决定是否采纳</li>
            <li>新职业探索报告可提交审核，通过后进入共享职业库</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}
