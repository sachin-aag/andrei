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
