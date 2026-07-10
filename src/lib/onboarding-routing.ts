export function onboardingDestination(
  profile: { onboardingCompleted: boolean } | null | undefined,
  completedDestination = "/dashboard",
) {
  return profile?.onboardingCompleted ? completedDestination : "/onboarding";
}
