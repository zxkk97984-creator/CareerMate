import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChatHomePage } from "@/components/chat/chat-home";

export default async function HomePage() {
  const user = await getCurrentUser();

  // 未登录 → 登录页
  if (!user) redirect("/login");

  // 未完成引导 → 引导页
  if (!user.profile?.onboardingCompleted) redirect("/onboarding");

  // 已完成引导 → 聊天首页
  return (
    <ChatHomePage
      userId={user.id}
      displayName={user.displayName}
    />
  );
}
