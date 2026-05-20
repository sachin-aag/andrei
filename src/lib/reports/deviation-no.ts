import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";

export const DUPLICATE_DEVIATION_NO_ERROR =
  "A report with this deviation number already exists";

/** Trim only — deviation numbers are compared and stored literally. */
export function normalizeDeviationNo(value: string): string {
  return value.trim();
}

export async function isDeviationNoTaken(
  deviationNo: string,
  excludeReportId?: string
): Promise<boolean> {
  const normalized = normalizeDeviationNo(deviationNo);
  if (!normalized) return false;

  const where = excludeReportId
    ? and(eq(reports.deviationNo, normalized), ne(reports.id, excludeReportId))
    : eq(reports.deviationNo, normalized);

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(where)
    .limit(1);

  return Boolean(existing);
}
