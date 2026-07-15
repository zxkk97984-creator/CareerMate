import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChatHomePage } from "@/components/chat/chat-home";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 开放入口：不强制跳转 onboarding，用户可直接开始聊天
  return (
    <ChatHomePage
      userId={user.id}
      displayName={user.displayName}
    />
  );
}
