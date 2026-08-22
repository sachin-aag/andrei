/**
 * Crypto-free ingest continue helpers. Workflows must import from here, not
 * `ingest-continue.ts` (HMAC uses `node:crypto` and fails `next build`).
 */
export const MAX_INGEST_CONTINUATIONS = 24;

export function formatIngestPageLabel(
  page: number | null | undefined
): string | null {
  if (page == null || !Number.isInteger(page) || page < 1) return null;
  return `Page ${page}`;
}
