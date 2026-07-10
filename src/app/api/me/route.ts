import { fail, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { calculateMatch } from "@/lib/career";
import { profileDto, userDto } from "@/lib/dto";
import { getTboxConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const profile = user.profile ? profileDto(user.profile) : null;
  const [match, recentProgressLogs] = await Promise.all([
    profile ? calculateMatch(profile) : Promise.resolve(null),
    getPrisma().progressLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, eventType: true, title: true, summary: true, createdAt: true },
    }),
  ]);

  return ok({
    user: userDto(user),
    profile,
    match,
    recentProgressLogs: recentProgressLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    aiRuntime: { requestedMode: getTboxConfig().mode },
  });
}
