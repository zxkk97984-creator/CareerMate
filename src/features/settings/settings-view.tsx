"use client";

/** 设置页 —— 账号 / AI 陪伴形象 / 隐私与数据 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import { fetchApi } from "@/lib/client-api";
import { settingsTabs, resolveSettingsTab, type SettingsTab } from "@/lib/settings-tabs";
import { AVATAR_MIME_TYPES, MAX_AVATAR_DATA_URL_LENGTH, MAX_AVATAR_SOURCE_BYTES } from "@/lib/account";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Button } from "@/components/ui/button";
import { CompanionAppearanceSelector } from "@/components/chat/companion-appearance-selector";
import type { WorkspaceData } from "@/lib/workspace-types";

interface SettingsViewProps {
  user: NonNullable<WorkspaceData["user"]>;
  refresh: () => Promise<void>;
  setNotice: (v: string) => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("无法读取这张图片"));
    img.src = src;
  });
}

/** 把本地图片压缩到最长边 256px 后转成 base64 PNG，避免把原图直接塞进数据库 */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取这张图片"));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  const MAX_EDGE = 256;
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器不支持图片处理");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function SettingsView({ user, refresh, setNotice }: SettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarDraft, setAvatarDraft] = useState<string | null>(user.avatarDataUrl);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [clearConfirmation, setClearConfirmation] = useState("");

  const activeTab: SettingsTab = resolveSettingsTab(searchParams.get("tab"));

  useEffect(() => {
    setDisplayName(user.displayName);
    setAvatarDraft(user.avatarDataUrl);
  }, [user.id, user.displayName, user.avatarDataUrl]);

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/settings?${params.toString()}`);
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file) return;
    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      setNotice("请选择 PNG、JPEG、WebP 或 GIF 图片。");
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setNotice("图片超过 5MB，请换一张更小的图片。");
      return;
    }
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
        setNotice("图片处理后仍然过大，请换一张更小的图片。");
        return;
      }
      setAvatarDraft(dataUrl);
      setNotice("头像已选择，点击「保存资料」后生效。");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "图片处理失败，请换一张试试。");
    }
  }

  async function saveProfile() {
    const nextName = displayName.trim();
    if (!nextName || nextName.length > 32) {
      setNotice("显示名称需为 1–32 个字符。");
      return;
    }
    setSavingProfile(true);
    const r = await fetchApi<{ user: NonNullable<WorkspaceData["user"]> }>("/api/account", {
      method: "PATCH",
      body: JSON.stringify({ displayName: nextName, avatarDataUrl: avatarDraft }),
    });
    setSavingProfile(false);
    if (!r.ok) {
      setNotice(r.error?.message ?? "账号资料保存失败，请稍后重试。");
      return;
    }
    setNotice("账号资料已保存。");
    await refresh();
  }

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setNotice("请完整填写当前密码与两次新密码。");
      return;
    }
    if (newPassword.length < 6) {
      setNotice("新密码至少需要 6 位。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice("两次输入的新密码不一致。");
      return;
    }
    setSavingPassword(true);
    const r = await fetchApi("/api/account/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPassword(false);
    if (!r.ok) {
      setNotice(r.error?.message ?? "密码修改失败，请稍后重试。");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNotice("密码已更新。");
  }

  async function exportData() {
    const r = await fetchApi<Record<string, unknown>>("/api/privacy/export");
    if (!r.ok) return setNotice(r.error?.message ?? "数据导出失败。");
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "careermate-data.json";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("账号成长数据已导出，敏感凭据未包含在文件中。");
  }

  async function clearData(): Promise<void> {
    const r = await fetchApi<{ cleared: boolean }>("/api/privacy/account-data", {
      method: "DELETE",
      body: JSON.stringify({ confirmation: clearConfirmation }),
    });
    if (!r.ok) {
      setNotice(r.error?.message ?? "成长数据清空失败。");
      return;
    }
    setClearConfirmation("");
    setNotice("成长数据已清空，正在跳转画像引导...");
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="memory-tabbed" data-od-id="settings-layout">
      <div className="memory-tabs" role="tablist" aria-label="设置">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`memory-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "account" && (
        <div className="memory-stack">
          <SurfaceCard title="账号信息" description="头像与显示名称保存到本机数据库，用户名用于登录且不可修改">
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: "50%",
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    background: "var(--cm-tint-brand)",
                    color: "var(--cm-brand-ink)",
                    fontSize: 32,
                    fontWeight: 700,
                    border: "1px solid var(--cm-border)",
                  }}
                >
                  {avatarDraft ? (
                    <Image src={avatarDraft} alt="头像预览" width={88} height={88} style={{ width: 88, height: 88, objectFit: "cover" }} unoptimized />
                  ) : (
                    (displayName.trim() || user.displayName || user.username).slice(0, 1).toUpperCase()
                  )}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button variant="secondary" icon={Upload} onClick={() => fileInputRef.current?.click()}>
                      更换头像
                    </Button>
                    {avatarDraft && (
                      <Button variant="ghost" icon={Trash2} onClick={() => setAvatarDraft(null)}>
                        移除头像
                      </Button>
                    )}
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--cm-text-subtle)" }}>支持 PNG / JPEG / WebP / GIF，最大 5MB，会自动压缩</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_MIME_TYPES.join(",")}
                  aria-label="选择头像图片"
                  hidden
                  onChange={(e) => {
                    void onPickAvatar(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--cm-text-strong)" }}>显示名称</span>
                  <input
                    className="cm-input"
                    aria-label="显示名称"
                    value={displayName}
                    maxLength={32}
                    placeholder="你的名字或昵称"
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--cm-text-strong)" }}>用户名</span>
                  <input className="cm-input" aria-label="用户名" value={user.username} disabled />
                </label>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "var(--cm-text-subtle)", minWidth: 0, flex: "1 1 240px" }}>保存后侧栏与聊天页的头像、名称会同步更新</span>
                <Button loading={savingProfile} disabled={!displayName.trim() || displayName.trim() === user.displayName && avatarDraft === user.avatarDataUrl} onClick={saveProfile}>
                  保存资料
                </Button>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard title="修改密码" description="需要验证当前密码；修改成功后请使用新密码登录">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--cm-text-strong)" }}>当前密码</span>
                <input className="cm-input" type="password" aria-label="当前密码" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--cm-text-strong)" }}>新密码</span>
                <input className="cm-input" type="password" aria-label="新密码" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--cm-text-strong)" }}>确认新密码</span>
                <input className="cm-input" type="password" aria-label="确认新密码" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </label>
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <Button
                loading={savingPassword}
                disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                onClick={changePassword}
              >
                修改密码
              </Button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {activeTab === "appearance" && (
        <div className="memory-stack">
          <SurfaceCard title="AI 陪伴形象" description="选择浮动陪伴、聊天头像和 AI 助手标题使用的形象；选择立即生效并保存在本机">
            <CompanionAppearanceSelector />
          </SurfaceCard>
        </div>
      )}

      {activeTab === "privacy" && (
        <SurfaceCard title="隐私与数据" description="导出与清空，数据完全由你掌控">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-text-strong)" }}>导出 JSON</div>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--cm-text-subtle)" }}>下载全部成长数据，敏感凭据不会包含在内</p>
              </div>
              <Button variant="secondary" onClick={() => void exportData()}>导出</Button>
            </div>

            <div style={{ borderTop: "1px solid var(--cm-border)", paddingTop: 14, background: "var(--cm-danger-bg)", borderRadius: "var(--cm-radius-control)", padding: "16px" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--cm-danger)" }}>清空成长数据</div>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--cm-text-muted)" }}>
                清空会删除画像成长数据并重新进入引导，但保留账号、角色和当前登录态。请输入确认词{" "}
                <code style={{ background: "var(--cm-danger-bg)", color: "var(--cm-danger)", padding: "2px 6px", borderRadius: 4 }}>CLEAR_MY_DATA</code>。
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  aria-label="清空确认词"
                  className="cm-input"
                  style={{ width: "auto", flex: 1, minWidth: 200 }}
                  placeholder="输入确认词以启用"
                  value={clearConfirmation}
                  onChange={(e) => setClearConfirmation(e.target.value)}
                />
                <Button variant="danger" disabled={clearConfirmation !== "CLEAR_MY_DATA"} onClick={() => void clearData()} style={{ flexShrink: 0 }}>
                  清空成长数据
                </Button>
              </div>
            </div>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
