"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MockUser } from "@/lib/auth/mock-users-data";
import {
  hydrateUserDirectory,
  lookupUserInDirectory,
} from "@/lib/auth/user-directory";

type UserDirectoryContextValue = {
  getUser: (id: string | null | undefined) => MockUser | undefined;
};

const UserDirectoryContext = createContext<UserDirectoryContextValue | null>(
  null
);

function syncUserDirectory(users: MockUser[]) {
  hydrateUserDirectory(users);
}

export function UserDirectoryProvider({
  initialUsers,
  children,
}: {
  initialUsers: MockUser[];
  children: React.ReactNode;
}) {
  const [version, setVersion] = useState(0);
  const syncedKeyRef = useRef<string>("");

  const usersKey = useMemo(
    () => initialUsers.map((user) => user.id).sort().join("|"),
    [initialUsers]
  );

  if (syncedKeyRef.current !== usersKey) {
    syncUserDirectory(initialUsers);
    syncedKeyRef.current = usersKey;
  }

  useEffect(() => {
    void fetch("/api/auth/users")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { users?: MockUser[] } | null) => {
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
