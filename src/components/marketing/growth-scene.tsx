/* The supplied illustration is shared by both public pages; milestone labels remain accessible HTML. */
/* eslint-disable @next/next/no-img-element -- Preserve the supplied decorative WebP without an image API request. */
export function GrowthScene({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <div aria-hidden="true" className="v2-scene v2-auth-scene">
      <div className="v2-scene-inner">
        <img alt="" className="v2-landscape" decoding="async" draggable={false} fetchPriority="high" height="686" src="/images/marketing/growth-landscape.webp" width="936" />
        <svg aria-hidden="true" className="v3-route-lights" viewBox="0 0 936 686">
          <circle cx="255" cy="565" r="10" />
          <circle cx="484" cy="495" r="9" />
          <circle cx="641" cy="397" r="8" />
          <circle cx="802" cy="335" r="7" />
        </svg>
        <div className="v2-milestone v2-milestone-1">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"认识自己"}
            </strong>
            <span>
              {"发现兴趣与优势"}
            </span>
          </span>
        </div>
        <div className="v2-milestone v2-milestone-2">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"探索方向"}
            </strong>
            <span>
              {"找到更多可能"}
            </span>
          </span>
        </div>
        <div className="v2-milestone v2-milestone-3">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M5 21V4M5 4c4-4 9 4 14 0v10c-5 4-10-4-14 0" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"形成计划"}
            </strong>
            <span>
              {"把目标变成行动"}
            </span>
          </span>
        </div>
        <div className="v2-milestone v2-milestone-4">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"持续成长"}
            </strong>
            <span>
              {"看见更好的自己"}
            </span>
          </span>
        </div>
        <span className="v2-scene-number v2-number-1">
          {"01"}
        </span>
        <span className="v2-scene-number v2-number-2">
          {"02"}
        </span>
        <span className="v2-scene-number v2-number-3">
          {"03"}
        </span>
        <span className="v2-scene-number v2-number-4">
          {"04"}
        </span>
      </div>
    </div>
  ) : (
    <div aria-label="从认识自己到持续成长的路径，可点击节点了解对应功能" className="v2-scene" role="group">
      <div className="v2-scene-inner">
        <img alt="" className="v2-landscape" decoding="async" draggable={false} fetchPriority="high" height="686" src="/images/marketing/growth-landscape.webp" width="936" />
        <svg aria-hidden="true" className="v3-route-lights" viewBox="0 0 936 686">
          <circle cx="255" cy="565" r="10" />
          <circle cx="484" cy="495" r="9" />
          <circle cx="641" cy="397" r="8" />
          <circle cx="802" cy="335" r="7" />
        </svg>
        <button aria-label="了解认识自己" className="v2-milestone v2-milestone-1" data-preview="profile" type="button">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"认识自己"}
            </strong>
            <span>
              {"发现兴趣与优势"}
            </span>
          </span>
        </button>
        <button aria-label="了解探索方向" className="v2-milestone v2-milestone-2" data-preview="explore" type="button">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"探索方向"}
            </strong>
            <span>
              {"找到更多可能"}
            </span>
          </span>
        </button>
        <button aria-label="了解形成计划" className="v2-milestone v2-milestone-3" data-preview="plan" type="button">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M5 21V4M5 4c4-4 9 4 14 0v10c-5 4-10-4-14 0" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"形成计划"}
            </strong>
            <span>
              {"把目标变成行动"}
            </span>
          </span>
        </button>
        <button aria-label="了解持续成长" className="v2-milestone v2-milestone-4" data-preview="growth" type="button">
          <span className="v2-milestone-icon">
            <svg aria-hidden="true" className="v2-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17" />
            </svg>
          </span>
          <span className="v2-milestone-copy">
            <strong>
              {"持续成长"}
            </strong>
            <span>
              {"看见更好的自己"}
            </span>
          </span>
        </button>
        <span className="v2-scene-number v2-number-1">
          {"01"}
        </span>
        <span className="v2-scene-number v2-number-2">
          {"02"}
        </span>
        <span className="v2-scene-number v2-number-3">
          {"03"}
        </span>
        <span className="v2-scene-number v2-number-4">
          {"04"}
        </span>
      </div>
    </div>
  );
}
