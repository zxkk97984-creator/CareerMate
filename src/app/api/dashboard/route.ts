import { fail, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard/service";

export async function GET() {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);
  try {
    const response = ok(await getDashboard(user));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return fail("DASHBOARD_UNAVAILABLE", "成长概览暂时未能加载，请重试。", 500);
  }
}
