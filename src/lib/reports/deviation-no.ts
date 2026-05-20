import { and, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";

export const DUPLICATE_DEVIATION_NO_ERROR =
  "A report with this deviation number already exists";

/** Canonical form for storage and duplicate checks (e.g. DEV/PR/24/016). */
export function normalizeDeviationNo(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s/\\_-]+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function canonicalDeviationNoExpr() {
  return sql<string>`regexp_replace(
    regexp_replace(upper(trim(${reports.deviationNo})), '[[:space:]/_-]+', '/', 'g'),
    '/+',
    '/',
    'g'
  )`;
}

export async function isDeviationNoTaken(
  deviationNo: string,
  excludeReportId?: string
): Promise<boolean> {
  const normalized = normalizeDeviationNo(deviationNo);
  if (!normalized) return false;

  const canonical = canonicalDeviationNoExpr();
  const where = excludeReportId
    ? and(sql`${canonical} = ${normalized}`, ne(reports.id, excludeReportId))
    : sql`${canonical} = ${normalized}`;

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(where)
    .limit(1);

  return Boolean(existing);
}
