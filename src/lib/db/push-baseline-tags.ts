/**
 * Journal tags added on the whitelabel line after MJ's last production
 * schema (0029). A push-managed MJ database has `reports` but no
 * `document_no`; those tags must run as SQL, not be stamped as applied.
 *
 * Anything numbered 0030 or later is left unstamped so `migrate()` can
 * apply 0031–0037. Stamping a later tag (0038+) would raise max
 * `created_at` and make Drizzle skip the cutover files.
 */
export function migrationTagNumber(tag: string): number | undefined {
  const match = /^(\d{4})_/.exec(tag);
  if (!match) return undefined;
  return Number(match[1]);
}

export function isPostMjMainMigrationTag(tag: string): boolean {
  const n = migrationTagNumber(tag);
  return n !== undefined && n >= 30 && n <= 37;
}

/**
 * Pre-0037 MJ already has 0000–0029 objects. Replaying `0000_third_nighthawk`
 * (`CREATE TABLE` without IF NOT EXISTS) is unnecessary and can ETIMEDOUT on
 * Neon Free while the pool reconnects.
 */
export function shouldReplayUnrecordedMigrationTag(args: {
  tag: string;
  hasDocumentNoColumn: boolean;
}): boolean {
  if (args.hasDocumentNoColumn) return true;
  const n = migrationTagNumber(args.tag);
  return n !== undefined && n >= 30;
}

export function tagsToStampOnEmptyPushJournal(args: {
  journalTags: readonly string[];
  extraTags: readonly string[];
  hasDocumentNoColumn: boolean;
}): string[] {
  const tags = [...args.journalTags, ...args.extraTags];
  if (args.hasDocumentNoColumn) return tags;
  return tags.filter((tag) => {
    const n = migrationTagNumber(tag);
    return n === undefined || n < 30;
  });
}
