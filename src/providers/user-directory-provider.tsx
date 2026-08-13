"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  hydrateUserDirectory,
  lookupUserInDirectory,
} from "@/lib/auth/user-directory";

type UserDirectoryContextValue = {
  users: WorkspaceUser[];
  getUser: (id: string | null | undefined) => WorkspaceUser | undefined;
};

const UserDirectoryContext = createContext<UserDirectoryContextValue | null>(
  null
);

function syncUserDirectory(users: WorkspaceUser[]) {
  hydrateUserDirectory(users);
}

export function UserDirectoryProvider({
  initialUsers,
  children,
}: {
  initialUsers: WorkspaceUser[];
  children: React.ReactNode;
}) {
  const [fetchedUsers, setFetchedUsers] = useState<WorkspaceUser[] | null>(null);
  const users = fetchedUsers ?? initialUsers;

  // Hydrate during render so the first child pass can look users up.
  // useLayoutEffect is too late: children's useEffects capture role=undefined
  // from the first paint (e.g. chat locking into Plan and never switching back).
  syncUserDirectory(users);

  useEffect(() => {
    void fetch("/api/auth/users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { users?: WorkspaceUser[] } | null) => {
        if (!data?.users) return;
        syncUserDirectory(data.users);
        setFetchedUsers(data.users);
      });
  }, []);

  const value = useMemo(
    () => ({
      users,
      getUser: (id: string | null | undefined) => {
        if (!id) return undefined;
        return users.find((user) => user.id === id) ?? lookupUserInDirectory(id);
      },
    }),
    [users]
  );

  return (
    <UserDirectoryContext value={value}>{children}</UserDirectoryContext>
  );
}

export function useUserDirectory(): UserDirectoryContextValue {
  const context = useContext(UserDirectoryContext);
  if (!context) {
    return { users: [], getUser: lookupUserInDirectory };
  }
  return context;
}
