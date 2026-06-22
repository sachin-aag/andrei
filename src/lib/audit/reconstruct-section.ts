import { applyPatch, type Operation } from "fast-json-patch";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { sectionContentVersions, type SectionType } from "@/db/schema";

export async function reconstructSectionAtVersion(
  reportId: string,
  section: SectionType,
  targetVersionNo: number
): Promise<unknown> {
  const rows = await db
    .select()
    .from(sectionContentVersions)
    .where(
      and(
        eq(sectionContentVersions.reportId, reportId),
        eq(sectionContentVersions.section, section),
        lte(sectionContentVersions.versionNo, targetVersionNo)
      )
    )
    .orderBy(asc(sectionContentVersions.versionNo));

  if (rows.length === 0) {
    return {};
  }

  let snapshotRow = [...rows].reverse().find((r) => r.isSnapshot && r.contentSnapshot);
  if (!snapshotRow) {
    snapshotRow = rows.find((r) => r.isSnapshot && r.contentSnapshot) ?? rows[0];
  }

  let content: unknown = snapshotRow.contentSnapshot ?? {};
  const startVersion = snapshotRow.versionNo;

  for (const row of rows) {
    if (row.versionNo <= startVersion) continue;
    if (row.versionNo > targetVersionNo) break;
    if (row.isSnapshot && row.contentSnapshot) {
      content = row.contentSnapshot;
      continue;
    }
    if (row.diff && Array.isArray(row.diff)) {
      const result = applyPatch(
        structuredClone(content) as object,
        row.diff as Operation[],
        true,
        false
      );
      content = result.newDocument;
    }
  }

  return content;
}

export async function listSectionVersions(
  reportId: string,
  section?: SectionType
) {
  const where = section
    ? and(
        eq(sectionContentVersions.reportId, reportId),
        eq(sectionContentVersions.section, section)
      )
    : eq(sectionContentVersions.reportId, reportId);

  return db
    .select({
      id: sectionContentVersions.id,
      section: sectionContentVersions.section,
      versionNo: sectionContentVersions.versionNo,
      isSnapshot: sectionContentVersions.isSnapshot,
      contentHash: sectionContentVersions.contentHash,
      auditEventId: sectionContentVersions.auditEventId,
      createdAt: sectionContentVersions.createdAt,
    })
    .from(sectionContentVersions)
    .where(where)
    .orderBy(asc(sectionContentVersions.section), asc(sectionContentVersions.versionNo));
}
