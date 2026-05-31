import type { WorkspaceUser } from "@/lib/auth/workspace-user";

let usersById = new Map<string, WorkspaceUser>();

export function hydrateUserDirectory(users: WorkspaceUser[]): void {
  usersById = new Map(users.map((user) => [user.id, user]));
}

export function lookupUserInDirectory(
  id: string | null | undefined
): WorkspaceUser | undefined {
  if (!id) return undefined;
  return usersById.get(id);
}

export function getUser(
  id: string | null | undefined
): WorkspaceUser | undefined {
  return lookupUserInDirectory(id);
}
