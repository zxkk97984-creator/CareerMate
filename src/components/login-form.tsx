"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Eye, EyeOff, Lock, UserRound } from "lucide-react";

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
    <main
      style={{
        minHeight: "100vh",
        background: "var(--cm-canvas)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 48,
          maxWidth: 960,
          width: "100%",
          alignItems: "center",
          overflow: "hidden",
        }}
        className="grid-cols-1 lg:grid-cols-[1fr_420px] max-w-md lg:max-w-[960px]"
      >
        {/* ── 左侧品牌说明 ───────────────────────────── */}
        <section className="max-lg:text-center max-lg:hidden" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: "var(--cm-radius-card)",
              background: "var(--cm-gradient-brand)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <BriefcaseBusiness size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: 40, fontWeight: 700, color: "var(--cm-text-strong)", margin: 0 }}>
              CareerMate
            </h1>
            <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.7, color: "var(--cm-text-muted)", maxWidth: 440 }}>
              面向高校生与职场新人的 AI 职业导航与终身学习伙伴。先建立画像，再生成路径，并通过模拟训练持续校准成长计划。
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, maxWidth: 480 }}>
            {["动态画像", "职业路径", "模拟训练"].map((item, i) => (
              <div
                key={item}
                style={{
                  padding: 16, borderRadius: "var(--cm-radius-card)",
                  border: "1px solid var(--cm-border)", background: "var(--cm-surface)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--cm-text-subtle)" }}>0{i + 1}</div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600, color: "var(--cm-text-strong)" }}>
                  {item}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 右侧认证卡片 ───────────────────────────── */}
        <section
          style={{
            background: "var(--cm-surface)", borderRadius: "var(--cm-radius-container)",
            border: "1px solid var(--cm-border)", padding: 32,
            boxShadow: "var(--cm-shadow-float)",
          }}
        >
          {/* 登录/注册切换 */}
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: "var(--cm-radius-control)", background: "var(--cm-canvas)" }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => { setMode("login"); setError(""); }}
              style={{
                flex: 1, height: 44, borderRadius: "var(--cm-radius-sm)", border: "none",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                background: mode === "login" ? "var(--cm-surface)" : "transparent",
                color: mode === "login" ? "var(--cm-text-strong)" : "var(--cm-text-muted)",
                boxShadow: mode === "login" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              登录
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => { setMode("register"); setError(""); }}
              style={{
                flex: 1, height: 44, borderRadius: "var(--cm-radius-sm)", border: "none",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                background: mode === "register" ? "var(--cm-surface)" : "transparent",
                color: mode === "register" ? "var(--cm-text-strong)" : "var(--cm-text-muted)",
                boxShadow: mode === "register" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              注册
            </button>
          </div>

          {/* 表单 */}
          <form onSubmit={submit} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "var(--cm-text-strong)" }}>
                <UserRound size={16} />
                账号
              </span>
              <input
                style={{
                  height: 44, borderRadius: "var(--cm-radius-control)",
                  border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)",
                  padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)",
                  outline: "none",
                }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </label>

            {mode === "register" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-text-strong)" }}>昵称</span>
                <input
                  style={{
                    height: 44, borderRadius: "var(--cm-radius-control)",
                    border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)",
                    padding: "0 12px", fontSize: 14, color: "var(--cm-text-strong)",
                    outline: "none",
                  }}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "var(--cm-text-strong)" }}>
                <Lock size={16} />
                密码
              </span>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  style={{
                    height: 44, width: "100%", borderRadius: "var(--cm-radius-control)",
                    border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)",
                    padding: "0 40px 0 12px", fontSize: 14, color: "var(--cm-text-strong)",
                    outline: "none",
                  }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", padding: 4, cursor: "pointer",
                    color: "var(--cm-text-muted)", display: "flex",
                  }}
                  aria-label={showPassword ? "隐藏口令" : "显示口令"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                style={{
                  padding: "10px 12px", borderRadius: "var(--cm-radius-control)",
                  background: "var(--cm-danger-bg)", color: "var(--cm-danger)",
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 44, width: "100%", borderRadius: "var(--cm-radius-control)",
                border: "none", background: "var(--cm-brand)", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "处理中..." : mode === "login" ? "进入 CareerMate" : "创建账号"}
            </button>
          </form>

          {/* 演示账号 */}
          <details style={{ marginTop: 20, fontSize: 13, color: "var(--cm-text-muted)" }}>
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
                    style={{
                      padding: "4px 10px", borderRadius: "var(--cm-radius-sm)",
                      border: "1px solid var(--cm-border-strong)", background: "var(--cm-surface)",
                      fontSize: 12, color: "var(--cm-brand)", cursor: "pointer",
                      fontWeight: 500,
                    }}
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
