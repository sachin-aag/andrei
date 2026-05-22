import { MOCK_USERS, type MockUser } from "@/lib/auth/mock-users-data";

const mockById = new Map(MOCK_USERS.map((user) => [user.id, user]));
let extraById = new Map<string, MockUser>();

export function hydrateUserDirectory(users: MockUser[]): void {
  extraById = new Map(
    users.filter((user) => !mockById.has(user.id)).map((user) => [user.id, user])
  );
}

export function lookupUserInDirectory(
  id: string | null | undefined
): MockUser | undefined {
  if (!id) return undefined;
  return mockById.get(id) ?? extraById.get(id);
}

export function getUser(id: string | null | undefined): MockUser | undefined {
  return lookupUserInDirectory(id);
}
