import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeDestination } from "@/lib/onboarding-routing";
import { LandingPage } from "@/components/landing-page";

export default async function HomePage() {
  const user = await getCurrentUser();
  // 未登录：显示主页，由主页按钮跳转登录页
  if (!user) return <LandingPage />;
  // 统一按画像完成度路由：已完成进入成长概览，未完成续接引导。
  // 与 WorkspacePage / login 守卫一致，避免 OPEN_CHAT_ENTRY 与实际守卫不一致。
  redirect(homeDestination(user.profile));
}
