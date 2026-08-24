/**
 * Always-on hidden manager for Andrei expert review.
 *
 * Provisioned on every customer pack (demo, MJ, Convergent). Assigned to
 * every report, omitted from engineer-facing manager pickers and name chips.
 * The Convergent "Request expert review" button is a separate pack flag.
 */
export const HIDDEN_EXPERT_REVIEWER_EMAIL = "aditya+manager@andreihealth.com";
export const HIDDEN_EXPERT_REVIEWER_NAME = "Aditya";
export const HIDDEN_EXPERT_REVIEWER_TITLE = "Andrei expert reviewer";
export const EXPERT_REVIEW_NOTE_MAX_LENGTH = 4000;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isHiddenExpertReviewerEmail(
  email: string | null | undefined
): boolean {
  return normalizeEmail(email) === HIDDEN_EXPERT_REVIEWER_EMAIL;
}

export function isHiddenExpertReviewer(user: {
  email?: string | null;
  role?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  return isHiddenExpertReviewerEmail(user.email);
}

export function withHiddenExpertReviewer(
  managerIds: readonly string[],
  expertId: string
): string[] {
  const trimmedExpertId = expertId.trim();
  if (!trimmedExpertId) return [...managerIds];
  if (managerIds.includes(trimmedExpertId)) return [...managerIds];
  return [...managerIds, trimmedExpertId];
}

export function managersVisibleInPicker<
  T extends { email?: string | null; role?: string | null },
>(users: readonly T[]): T[] {
  return users.filter(
    (user) => user.role === "manager" && !isHiddenExpertReviewerEmail(user.email)
  );
}

export function managerIdsVisibleInDisplay(
  managerIds: readonly string[],
  usersById: Readonly<
    Record<string, { email?: string | null; name?: string | null } | undefined>
  >
): string[] {
  return managerIds.filter(
    (id) => !isHiddenExpertReviewerEmail(usersById[id]?.email)
  );
}

export function visibleManagerNames(
  managerIds: readonly string[],
  usersById: Readonly<
    Record<string, { email?: string | null; name?: string | null } | undefined>
  >
): string[] {
  return managerIdsVisibleInDisplay(managerIds, usersById)
    .map((id) => usersById[id]?.name)
    .filter((name): name is string => Boolean(name));
}
