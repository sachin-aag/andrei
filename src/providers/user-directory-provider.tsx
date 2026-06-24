"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
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
  const [version, setVersion] = useState(0);
  const users = fetchedUsers ?? initialUsers;

  useLayoutEffect(() => {
    syncUserDirectory(users);
  }, [users]);

  useEffect(() => {
    void fetch("/api/auth/users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { users?: WorkspaceUser[] } | null) => {
        if (!data?.users) return;
        syncUserDirectory(data.users);
        setFetchedUsers(data.users);
        setVersion((current) => current + 1);
      });
  }, []);

  const value = useMemo(
    () => ({
      users,
      getUser: (id: string | null | undefined) => {
        void version;
        return lookupUserInDirectory(id);
      },
    }),
    [users, version]
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
