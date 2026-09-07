export function onboardingDestination(
  profile: { onboardingCompleted: boolean } | null | undefined,
  completedDestination = "/",
) {
  return profile?.onboardingCompleted ? completedDestination : "/onboarding";
}

/** 首页/登录后的去向：已完成画像进入主聊天，未完成续接引导。 */
export function homeDestination(
  profile: { onboardingCompleted: boolean } | null | undefined,
) {
  return onboardingDestination(profile, "/chat");
}
