import { redirect } from "next/navigation";

export default function OnboardingPage() {
  // Keep existing bookmarks and entry guards working through the primary chat.
  redirect("/chat?intent=profile");
}
