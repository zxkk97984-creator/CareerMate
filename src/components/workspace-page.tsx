import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getCurrentUser } from "@/lib/auth";
import { homeDestination } from "@/lib/onboarding-routing";

export async function WorkspacePage({ view }: { view: Parameters<typeof Workspace>[0]["initialView"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (view !== "onboarding" && !user.profile?.onboardingCompleted) redirect(homeDestination(user.profile));
  // Admin 守卫：普通用户不可访问 Admin 页面
  if (view === "admin" && user.role !== "admin") redirect(homeDestination(user.profile));
  return (
    <Workspace
      initialView={view}
      isAdmin={user.role === "admin"}
    />
  );
}
