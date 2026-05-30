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
  const [version, setVersion] = useState(0);

  useLayoutEffect(() => {
    syncUserDirectory(initialUsers);
  }, [initialUsers]);

  useEffect(() => {
    void fetch("/api/auth/users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { users?: WorkspaceUser[] } | null) => {
        if (!data?.users) return;
        syncUserDirectory(data.users);
        setVersion((current) => current + 1);
      });
  }, []);

  const value = useMemo(
    () => ({
      getUser: (id: string | null | undefined) => {
        void version;
        return lookupUserInDirectory(id);
      },
    }),
    [version]
  );

  return (
    <UserDirectoryContext value={value}>{children}</UserDirectoryContext>
  );
}

export function useUserDirectory(): UserDirectoryContextValue {
  const context = useContext(UserDirectoryContext);
  if (!context) {
    return { getUser: lookupUserInDirectory };
  }
  return context;
}
