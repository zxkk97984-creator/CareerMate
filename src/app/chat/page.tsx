import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChatHomePage } from "@/components/chat/chat-home";
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const jobId = typeof params.jobId === "string" ? params.jobId : null;
  const jobIntent = typeof params.intent === "string" ? params.intent : null;
  return (
    <ChatHomePage
      initialConversationId={typeof params.conversationId === "string" ? params.conversationId : null}
      userId={user.id}
      displayName={user.displayName}
      avatar={user.avatarDataUrl}
      isAdmin={user.role === "admin"}
      jobId={jobId}
      jobIntent={jobIntent}
    />
  );
}
