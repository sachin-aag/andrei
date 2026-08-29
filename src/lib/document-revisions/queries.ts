import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documentRevisionSections, documentRevisions } from "@/db/schema";

export async function listDocumentRevisions(reportId: string) {
  return db
    .select({
      id: documentRevisions.id,
      revisionNo: documentRevisions.revisionNo,
      source: documentRevisions.source,
      summary: documentRevisions.summary,
      createdAt: documentRevisions.createdAt,
      updatedAt: documentRevisions.updatedAt,
      createdBy: documentRevisions.createdBy,
    })
    .from(documentRevisions)
    .where(eq(documentRevisions.reportId, reportId))
    .orderBy(asc(documentRevisions.revisionNo));
}

export async function loadRevisionSectionSnapshots(
  reportId: string,
  revisionNos: number[]
) {
  if (revisionNos.length === 0) return [];
  const revisions = await db
    .select({
      id: documentRevisions.id,
      revisionNo: documentRevisions.revisionNo,
    })
    .from(documentRevisions)
    .where(eq(documentRevisions.reportId, reportId));
  const wanted = revisions.filter((row) => revisionNos.includes(row.revisionNo));
  if (wanted.length === 0) return [];
  const sections = await db
    .select({
      revisionId: documentRevisionSections.revisionId,
      section: documentRevisionSections.section,
      content: documentRevisionSections.content,
      contentHash: documentRevisionSections.contentHash,
    })
    .from(documentRevisionSections)
    .where(
      inArray(
        documentRevisionSections.revisionId,
        wanted.map((row) => row.id)
      )
    );
  return wanted.map((revision) => ({
    revisionNo: revision.revisionNo,
    sections: sections
      .filter((row) => row.revisionId === revision.id)
      .map((row) => ({
        section: row.section,
        content: (row.content ?? {}) as Record<string, unknown>,
        contentHash: row.contentHash,
      })),
  }));
}
