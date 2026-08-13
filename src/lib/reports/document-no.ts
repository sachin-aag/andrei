import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { reports, type DocumentType } from "@/db/schema";

export const DUPLICATE_DOCUMENT_NO_ERROR =
  "You already have a report with this document number";

/** @deprecated Use DUPLICATE_DOCUMENT_NO_ERROR */
export const DUPLICATE_DEVIATION_NO_ERROR = DUPLICATE_DOCUMENT_NO_ERROR;

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth++) {
    const code = (current as { code?: string }).code;
    if (code) return code;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}

/** Trim only — document numbers are compared and stored literally. */
export function normalizeDocumentNo(value: string): string {
  return value.trim();
}

/** @deprecated Use normalizeDocumentNo */
export const normalizeDeviationNo = normalizeDocumentNo;

export async function isDocumentNoTaken(
  documentNo: string,
  authorId: string,
  documentType: DocumentType = "investigation_report",
  excludeReportId?: string
): Promise<boolean> {
  const normalized = normalizeDocumentNo(documentNo);
  if (!normalized) return false;

  const base = and(
    eq(reports.documentNo, normalized),
    eq(reports.authorId, authorId),
    eq(reports.documentType, documentType)
  );
  const where = excludeReportId
    ? and(base, ne(reports.id, excludeReportId))
    : base;

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(where)
    .limit(1);

  return Boolean(existing);
}

/** @deprecated Use isDocumentNoTaken */
export async function isDeviationNoTaken(
  deviationNo: string,
  authorId: string,
  excludeReportId?: string
): Promise<boolean> {
  return isDocumentNoTaken(
    deviationNo,
    authorId,
    "investigation_report",
    excludeReportId
  );
}
