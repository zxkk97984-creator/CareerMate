import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import {
  createSessionCredentials,
  hashSessionToken,
  sessionMaxAgeSeconds,
} from "@/lib/session-security";

export const sessionCookieName = "careermate_session";

async function getSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(sessionCookieName)?.value ?? null;
}

export async function setSession(userId: string) {
  const credentials = createSessionCredentials();
  await getPrisma().authSession.create({
    data: {
      userId,
      tokenHash: credentials.tokenHash,
      expiresAt: credentials.expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, credentials.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    await getPrisma().authSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser() {
  const token = await getSessionToken();
  if (!token) return null;

  const session = await getPrisma().authSession.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      expiresAt: { gt: new Date() },
    },
    include: {
      user: { include: { profile: true } },
    },
  });

  return session?.user ?? null;
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
