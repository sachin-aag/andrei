import { cookies } from "next/headers";
import type { MockUser } from "./mock-users";
import { getWorkspaceUserById } from "./workspace-users";

const SESSION_COOKIE = "mjb_session_uid";

export async function getCurrentUser(): Promise<MockUser | null> {
  const store = await cookies();
  const uid = store.get(SESSION_COOKIE)?.value;
  const user = await getWorkspaceUserById(uid);
  return user ?? null;
}

export async function requireCurrentUser(): Promise<MockUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export async function setSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
