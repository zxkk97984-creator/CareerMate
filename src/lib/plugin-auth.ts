import { getPluginToken } from "@/lib/env";

export function isPluginAuthorized(request: Request) {
  const configured = getPluginToken();
  if (!configured) return true;

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${configured}`;
}
