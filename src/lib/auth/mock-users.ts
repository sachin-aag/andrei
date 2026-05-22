export type { MockUser, UserRole } from "@/lib/auth/mock-users-data";
export { MOCK_USERS } from "@/lib/auth/mock-users-data";
export { getUser, hydrateUserDirectory } from "@/lib/auth/user-directory";

import { MOCK_USERS } from "@/lib/auth/mock-users-data";

export function getEngineers() {
  return MOCK_USERS.filter((u) => u.role === "engineer");
}

export function getManagers() {
  return MOCK_USERS.filter((u) => u.role === "manager");
}
