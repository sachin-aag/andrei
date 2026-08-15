/**
 * Postgres SQLSTATE codes that mean "this object is already there".
 * Repair/replay of push-bootstrapped DBs must skip these so a leftover
 * enum from drizzle-kit push does not abort creating the matching tables.
 */
const IGNORABLE_REPLAY_SQLSTATES = new Set([
  "42710", // duplicate_object (CREATE TYPE, constraints)
  "42701", // duplicate_column
  "42P07", // duplicate_table / relation already exists (indexes)
  "42723", // duplicate_function
]);

export function isIgnorableSchemaReplayError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  const code = error.code;
  if (typeof code !== "string") return false;
  return IGNORABLE_REPLAY_SQLSTATES.has(code);
}
