import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";

export const sessionCookieName = "careermate_session";

export async function getSessionUserId() {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookieName)?.value ?? null;
}

export async function setSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return getPrisma().user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireCurrentUser();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }

  return user;
}
