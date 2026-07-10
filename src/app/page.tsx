import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { onboardingDestination } from "@/lib/onboarding-routing";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? onboardingDestination(user.profile) : "/login");
}
