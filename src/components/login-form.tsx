"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FluidBackground } from "@/components/fluid-background";
import { BriefcaseBusiness, Eye, EyeOff, Lock, Map, MessagesSquare, UserRound } from "lucide-react";

type Mode = "login" | "register";

const DEMO_ACCOUNTS = [
  { label: "学生小林", username: "student_lin" },
  { label: "学生小陈", username: "student_chen" },
  { label: "学生小吴", username: "student_wu" },
  { label: "职场赵哥", username: "worker_zhao" },
  { label: "转行李哥", username: "career_switch_li" },
  { label: "管理员", username: "admin" },
] as const;

const DEMO_PASSWORD = "careermate123";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /** 填入演示账号 */
  function fillDemo(username: string) {
    setUsername(username);
    setPassword(DEMO_PASSWORD);
    if (mode === "register") setDisplayName(username);
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    const unavailableMessage = mode === "login"
      ? "登录服务暂时不可用，请稍后重试"
      : "注册服务暂时不可用，请稍后重试";

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { username, password }
            : { username, displayName, password },
        ),
      });

      // 保留空响应和非 JSON 响应恢复
      const rawPayload = await response.text();
      if (!rawPayload) throw new Error(unavailableMessage);

      let payload: { ok: boolean; data?: { nextPath?: string }; error?: { message?: string } };
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        throw new Error(unavailableMessage);
      }

      if (!payload.ok) {
        setError(payload.error?.message ?? "操作失败");
        return;
      }

      // 登录成功没有 nextPath 时进入 /，不回退 /dashboard
      const nextPath = payload.data?.nextPath;
      if (nextPath) {
        router.push(nextPath);
      } else {
        router.push(mode === "register" ? "/onboarding" : "/");
      }
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : unavailableMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <FluidBackground variant="calm" />
      <div className="login-grid" data-od-id="login-layout">
        {/* ── 卡片上方品牌区 ─────────────────────────── */}
        <div className="login-head">
          <span className="login-head-icon" aria-hidden="true">
            <BriefcaseBusiness size={20} />
          </span>
          <h1 className="login-head-title">
            Career<span className="login-title-accent">Mate</span>
          </h1>
          <p className="login-head-sub">
            AI 职业成长伙伴 · 登录或创建账号
          </p>
        </div>

        {/* ── 居中登录卡片 ─────────────────────────────── */}
        <section className="login-panel" aria-label="登录或注册">
          {/* 登录/注册切换 */}
          <div className="login-tabs" role="tablist" aria-label="登录注册切换">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              disabled={loading}
              onClick={() => { setMode("login"); setError(""); }}
              className={`login-tab ${mode === "login" ? "login-tab-active" : "login-tab-inactive"}`}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              disabled={loading}
              onClick={() => { setMode("register"); setError(""); }}
              className={`login-tab ${mode === "register" ? "login-tab-active" : "login-tab-inactive"}`}
            >
              注册
            </button>
          </div>

          {/* 表单 */}
          <form onSubmit={submit} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span className="login-field-label">
                <UserRound size={15} />
                账号
              </span>
              <input
                className="cm-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="输入账号"
              />
            </label>

            {mode === "register" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="login-field-label">昵称</span>
                <input
                  className="cm-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  placeholder="输入昵称"
                />
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span className="login-field-label">
                <Lock size={15} />
                密码
              </span>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  className="cm-input"
                  style={{ paddingRight: 44 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="输入密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", padding: 6, cursor: "pointer",
                    color: "var(--cm-text-muted)", display: "flex",
                  }}
                  aria-label={showPassword ? "隐藏口令" : "显示口令"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div role="alert" className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? "处理中..." : mode === "login" ? "进入 CareerMate" : "创建账号"}
            </button>
          </form>

          {/* 演示账号 */}
          <details className="login-demo" style={{ marginTop: 20, fontSize: 13 }}>
            <summary style={{ cursor: "pointer", marginBottom: 8 }}>
              演示账号（点击展开）
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--cm-text-subtle)" }}>
                选择一个账号快速填入，密码统一为 {DEMO_PASSWORD}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => fillDemo(acc.username)}
                    className="login-demo-btn"
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
