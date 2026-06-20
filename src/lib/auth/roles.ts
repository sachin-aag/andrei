export const USER_ROLES = ["engineer", "manager", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "engineer":
      return "Engineer";
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

export function defaultTitleForRole(role: UserRole): string {
  switch (role) {
    case "engineer":
      return "Engineer";
    case "manager":
      return "Manager";
    case "admin":
      return "Admin";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

export function isAdminRole(role: UserRole): boolean {
  return role === "admin";
}
