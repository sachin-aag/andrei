import { auth } from "@/auth";
import type { MockUser } from "./mock-users";
import { getWorkspaceUserById } from "./workspace-users";

export async function getCurrentUser(): Promise<MockUser | null> {
  const session = await auth();
  if (!session?.user?.workspaceUserId) return null;
  return (await getWorkspaceUserById(session.user.workspaceUserId)) ?? null;
}

export async function requireCurrentUser(): Promise<MockUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
