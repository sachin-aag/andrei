import { auth } from "@/auth";
import type { WorkspaceUser } from "./workspace-user";
import { getWorkspaceUserById } from "./workspace-users";

export async function getCurrentUser(): Promise<WorkspaceUser | null> {
  const session = await auth();
  if (!session?.user?.workspaceUserId) return null;
  return (await getWorkspaceUserById(session.user.workspaceUserId)) ?? null;
}

export async function requireCurrentUser(): Promise<WorkspaceUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
