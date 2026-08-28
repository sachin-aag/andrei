import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  documentRevisionSections,
  documentRevisions,
  reportSections,
  reports,
  type DocumentType,
} from "@/db/schema";
import { hashSectionContent } from "@/lib/audit";
import { getWorkspaceSections, mergeSectionForType } from "@/lib/document-types";
import { DOCUMENT_REVISION_METADATA_SECTION } from "@/lib/document-revisions/constants";

export type DocumentRevisionRecord = {
  id: string;
  reportId: string;
  revisionNo: number;
  source: "agent_turn";
  chatSessionId: string | null;
  chatMessageId: string | null;
  summary: string;
  createdBy: string | null;
  createdAt: Date;
};

export async function snapshotDocumentRevision(args: {
  reportId: string;
  documentType: DocumentType;
  summary: string;
  createdBy: string | null;
  chatSessionId?: string | null;
  chatMessageId?: string | null;
}): Promise<DocumentRevisionRecord> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.id, args.reportId))
      .for("update");

    const [latest] = await tx
      .select({ revisionNo: documentRevisions.revisionNo })
      .from(documentRevisions)
      .where(eq(documentRevisions.reportId, args.reportId))
      .orderBy(desc(documentRevisions.revisionNo))
      .limit(1);

    const revisionNo = (latest?.revisionNo ?? 0) + 1;
    const [revision] = await tx
      .insert(documentRevisions)
      .values({
        reportId: args.reportId,
        revisionNo,
        source: "agent_turn",
        chatSessionId: args.chatSessionId ?? null,
        chatMessageId: args.chatMessageId ?? null,
        summary: args.summary,
        createdBy: args.createdBy,
      })
      .returning();
    if (!revision) {
      throw new Error("Failed to create document revision.");
    }

    const [reportRow, sectionRows] = await Promise.all([
      tx
        .select({ metadata: reports.metadata })
        .from(reports)
        .where(eq(reports.id, args.reportId))
        .then((rows) => rows[0]),
      tx
        .select()
        .from(reportSections)
        .where(eq(reportSections.reportId, args.reportId)),
    ]);

    const workspace = getWorkspaceSections(args.documentType);
    const snapshots = workspace.map((section) => {
      const row = sectionRows.find((candidate) => candidate.section === section.key);
      const content = mergeSectionForType(
        args.documentType,
        section.key,
        row?.content ?? {}
      ) as Record<string, unknown>;
      return {
        revisionId: revision.id,
        section: section.key,
        content,
        contentHash: hashSectionContent(content),
      };
    });
    const metadata = (reportRow?.metadata ?? {}) as Record<string, unknown>;
    snapshots.push({
      revisionId: revision.id,
      section: DOCUMENT_REVISION_METADATA_SECTION,
      content: metadata,
      contentHash: hashSectionContent(metadata),
    });

    await tx.insert(documentRevisionSections).values(snapshots);
    return revision;
  });
}
