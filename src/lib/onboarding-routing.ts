export function onboardingDestination(
  profile: { onboardingCompleted: boolean } | null | undefined,
  completedDestination = "/",
) {
  return profile?.onboardingCompleted ? completedDestination : "/onboarding";
}
