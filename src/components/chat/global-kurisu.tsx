"use client";

import { usePathname } from "next/navigation";
import { KurisuChatWindow } from "./kurisu-chat-window";

/** 在所有登录后的页面显示 Kurisu，让用户随时随地和克里斯交流 */
export function GlobalKurisu() {
  const pathname = usePathname();

  // 首页、登录页和 onboarding 不显示悬浮克里斯
  if (pathname === "/" || pathname === "/login" || pathname === "/onboarding") return null;

  return <KurisuChatWindow />;
}
