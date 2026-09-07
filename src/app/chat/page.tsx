import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChatHomePage } from "@/components/chat/chat-home";
export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatHomePage userId={user.id} displayName={user.displayName} avatar={user.avatarDataUrl} isAdmin={user.role === "admin"} />;
}
