import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isOpenChatEntry } from "@/lib/env";
import { LandingPage } from "@/components/landing-page";

export default async function HomePage() {
  const user = await getCurrentUser();
  // 未登录：显示主页，由主页按钮跳转登录页
  if (!user) return <LandingPage />;
  // 对话板块已移除，登录后进入成长概览
  const openChatEntry = isOpenChatEntry();
  if (!openChatEntry) redirect("/onboarding");
  redirect("/dashboard");
}
