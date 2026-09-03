import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getCurrentUser } from "@/lib/auth";

export async function WorkspacePage({ view }: { view: Parameters<typeof Workspace>[0]["initialView"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (view !== "onboarding" && !user.profile?.onboardingCompleted) redirect("/onboarding");
  // Admin 守卫：普通用户不可访问 Admin 页面
  if (view === "admin" && user.role !== "admin") redirect("/");
  return (
    <Workspace
      initialView={view}
      isAdmin={user.role === "admin"}
    />
  );
}
