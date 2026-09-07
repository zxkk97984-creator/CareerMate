/** 设置页标签 id */
export type SettingsTab = "account" | "appearance" | "privacy";

export const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "account", label: "账号" },
  { id: "appearance", label: "AI 陪伴形象" },
  { id: "privacy", label: "隐私与数据" },
];

/** 解析深链接标签参数：未知值回退到默认「账号」，保证刷新/浏览器返回仍能定位 */
export function resolveSettingsTab(raw: string | null | undefined): SettingsTab {
  return raw && settingsTabs.some((t) => t.id === raw) ? (raw as SettingsTab) : "account";
}
