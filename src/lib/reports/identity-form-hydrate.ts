/**
 * Header identity lives on `reports` (not a section row). Chat `refresh()`
 * reloads the report bundle and would otherwise copy a stale GET over a
 * keystroke that has not reached PATCH yet.
 */

export type IdentityHydrateDecision = "skip" | "hydrate" | "restore";

export function decideIdentityHydrate(input: {
  incomingSerialized: string;
  localSerialized: string;
  lastPersistedSerialized: string;
  incomingUpdatedAt?: string | null;
  lastSeenUpdatedAt?: string | null;
}): IdentityHydrateDecision {
  if (input.incomingSerialized === input.localSerialized) return "skip";
  if (input.localSerialized !== input.lastPersistedSerialized) {
    return "restore";
  }
  if (
    input.incomingUpdatedAt &&
    input.lastSeenUpdatedAt &&
    input.incomingUpdatedAt < input.lastSeenUpdatedAt
  ) {
    return "restore";
  }
  return "hydrate";
}

/**
 * Same-clock `setReport` (a keystroke / delete) is not a server persist.
 * Only a newer `updatedAt` (Apply PATCH, GET after save) may clear dirty.
 */
export function shouldMarkIdentityHydratePersisted(input: {
  incomingUpdatedAt?: string | null;
  lastSeenUpdatedAt?: string | null;
}): boolean {
  if (!input.incomingUpdatedAt) return false;
  if (!input.lastSeenUpdatedAt) return true;
  return input.incomingUpdatedAt > input.lastSeenUpdatedAt;
}
