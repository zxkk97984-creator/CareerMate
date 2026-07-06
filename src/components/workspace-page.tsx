import { redirect } from "next/navigation";
import { Workspace } from "@/components/workspace";
import { getCurrentUser } from "@/lib/auth";

export async function WorkspacePage({ view }: { view: Parameters<typeof Workspace>[0]["initialView"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Workspace initialView={view} />;
}
