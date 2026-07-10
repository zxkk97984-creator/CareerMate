import { fail, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { calculateMatch } from "@/lib/career";
import { recoverAiRuntime } from "@/lib/ai-runtime";
import { profileDto, userDto } from "@/lib/dto";
import { getTboxConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { createIncompleteProfileDefaults } from "@/lib/profile-defaults";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "未登录或登录态过期", 401);

  const prisma = getPrisma();
  const storedProfile = user.profile ?? await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, ...createIncompleteProfileDefaults() },
  });
  const profile = profileDto(storedProfile);
  const requestedMode = getTboxConfig().mode;
  const [match, recentProgressLogs, latestOnboardingConversation] = await Promise.all([
    calculateMatch(profile),
    prisma.progressLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, eventType: true, title: true, summary: true, createdAt: true },
    }),
    prisma.onboardingConversation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { requestedMode: true, actualMode: true, transcript: true },
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
    aiRuntime: recoverAiRuntime(requestedMode, latestOnboardingConversation),
  });
}
