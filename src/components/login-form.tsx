"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Lock, UserRound } from "lucide-react";

type Mode = "login" | "register";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("student_lin");
  const [displayName, setDisplayName] = useState("新用户");
  const [password, setPassword] = useState("careermate123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "login" ? { username, password } : { username, displayName, password }),
    });
    const payload = await response.json();
    setLoading(false);
    if (!payload.ok) {
      setError(payload.error?.message ?? "操作失败");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] px-6 py-8 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="space-y-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
            <BriefcaseBusiness size={26} />
          </div>
          <div className="max-w-2xl">
            <h1 className="text-5xl font-semibold leading-tight tracking-normal text-slate-950">CareerMate</h1>
            <p className="mt-5 text-xl leading-8 text-slate-600">
              面向高校生与职场新人的 AI 职业导航与终身学习伙伴。先建立画像，再生成路径，并通过模拟训练持续校准成长计划。
            </p>
          </div>
          <div className="grid max-w-3xl gap-4 md:grid-cols-3">
            {["动态画像", "3 年路径", "模拟训练"].map((item, index) => (
              <div key={item} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">0{index + 1}</div>
                <div className="mt-3 text-lg font-semibold text-slate-900">{item}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
            <button
              className={`h-10 flex-1 rounded-md text-sm font-semibold ${mode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              onClick={() => setMode("login")}
            >
              登录
            </button>
            <button
              className={`h-10 flex-1 rounded-md text-sm font-semibold ${mode === "register" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              onClick={() => setMode("register")}
            >
              注册
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <UserRound size={16} />
                账号
              </span>
              <input
                className="focus-ring h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            {mode === "register" && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">昵称</span>
                <input
                  className="focus-ring h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lock size={16} />
                密码
              </span>
              <input
                type="password"
                className="focus-ring h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button
              disabled={loading}
              onClick={submit}
              className="h-11 w-full rounded-md bg-slate-950 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              {loading ? "处理中..." : mode === "login" ? "进入 CareerMate" : "创建账号"}
            </button>
          </div>

          <div className="mt-6 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            演示账号：`student_lin`、`student_chen`、`student_wu`、`worker_zhao`、`career_switch_li`、`admin`。
            默认密码均为 `careermate123`。
          </div>
        </section>
      </div>
    </main>
  );
}
