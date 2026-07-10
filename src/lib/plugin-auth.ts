import { getPluginToken } from "@/lib/env";

export function isPluginAuthorized(request: Request) {
  const configured = getPluginToken();
  if (!configured) {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_UNAUTHENTICATED_PLUGIN === "true"
    );
  }

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${configured}`;
}
