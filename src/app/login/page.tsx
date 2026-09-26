import { redirect } from "next/navigation";
import { LoginForm } from "@/components/careermate-login/login-form";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <LoginForm />;
}
