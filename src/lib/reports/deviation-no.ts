import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";

export const DUPLICATE_DEVIATION_NO_ERROR =
  "You already have a report with this deviation number";

/** Trim only — deviation numbers are compared and stored literally. */
export function normalizeDeviationNo(value: string): string {
  return value.trim();
}

export async function isDeviationNoTaken(
  deviationNo: string,
  authorId: string,
  excludeReportId?: string
): Promise<boolean> {
  const normalized = normalizeDeviationNo(deviationNo);
  if (!normalized) return false;

  const base = and(eq(reports.deviationNo, normalized), eq(reports.authorId, authorId));
  const where = excludeReportId ? and(base, ne(reports.id, excludeReportId)) : base;

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(where)
    .limit(1);

  return Boolean(existing);
}
