import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";

export const REVIEWER_STORAGE_KEY_PREFIX = "criteria-review:reviewer:v1";

export function reviewerStorageKey(authUserId: string | null): string {
  if (!authUserId) return REVIEWER_STORAGE_KEY_PREFIX;
  return `${REVIEWER_STORAGE_KEY_PREFIX}:${authUserId}`;
}

export function readStoredReviewer(authUserId: string | null): HumanReviewer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(reviewerStorageKey(authUserId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HumanReviewer>;
    const id = parsed.id?.trim();
    const name = parsed.name?.trim();
    const employeeId = parsed.employeeId?.trim();
    return id && name && employeeId ? { id, name, employeeId } : null;
  } catch {
    return null;
  }
}

export function storedReviewerIdFor(
  reviewerList: HumanReviewer[],
  authUserId: string | null
): string {
  const saved = readStoredReviewer(authUserId);
  if (saved && reviewerList.some((reviewer) => reviewer.id === saved.id)) {
    return saved.id;
  }
  return "";
}

export function persistReviewer(
  reviewer: HumanReviewer,
  authUserId: string | null
) {
  try {
    window.localStorage.setItem(
      reviewerStorageKey(authUserId),
      JSON.stringify(reviewer)
    );
  } catch {
    // localStorage can fail in private browsing; saving can continue without it.
  }
}

/** @deprecated Legacy key from before per-user scoping; cleared on hydrate. */
export const LEGACY_REVIEWER_STORAGE_KEY = "criteria-review:reviewer:v1";

export function clearLegacyReviewerStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_REVIEWER_STORAGE_KEY);
  } catch {
    // ignore
  }
}
