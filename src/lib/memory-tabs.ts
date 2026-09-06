/** 成长档案标签 id（T18） */
export type MemoryTab = "candidates" | "profile" | "privacy";

export const memoryTabs: Array<{ id: MemoryTab; label: string }> = [
  { id: "candidates", label: "待确认建议" },
  { id: "profile", label: "画像与证据" },
  { id: "privacy", label: "记忆与隐私" },
];

/**
 * 解析深链接标签参数：未知值回退到默认“待确认建议”，保证刷新/浏览器返回仍能定位（T18）。
 */
export function resolveMemoryTab(raw: string | null | undefined): MemoryTab {
  return raw && memoryTabs.some((t) => t.id === raw) ? (raw as MemoryTab) : "candidates";
}
