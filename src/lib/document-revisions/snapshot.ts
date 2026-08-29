import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  documentRevisionSections,
  documentRevisions,
  reportSections,
  reports,
  type DocumentRevisionSource,
  type DocumentType,
} from "@/db/schema";
import { hashSectionContent } from "@/lib/audit";
import { getWorkspaceSections, mergeSectionForType } from "@/lib/document-types";
import {
  DOCUMENT_REVISION_METADATA_SECTION,
  MANUAL_REVISION_IDLE_MS,
} from "@/lib/document-revisions/constants";

export type DocumentRevisionRecord = typeof documentRevisions.$inferSelect;

type RevisionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type SectionSnapshot = {
  section: string;
  content: Record<string, unknown>;
  contentHash: string;
};

export type ManualRevisionPlan =
  | { action: "skip" }
  | { action: "insert" }
  | { action: "replace"; revisionId: string };

export function revisionFingerprint(
  rows: { section: string; contentHash: string }[]
): string {
  return rows
    .map((row) => `${row.section}:${row.contentHash}`)
    .toSorted((a, b) => a.localeCompare(b))
    .join("|");
}

export function planManualRevision(args: {
  latest: {
    id: string;
    source: DocumentRevisionSource;
    updatedAt: Date;
    fingerprint: string;
  } | null;
  nextFingerprint: string;
  now: Date;
  idleMs?: number;
}): ManualRevisionPlan {
  if (args.latest && args.latest.fingerprint === args.nextFingerprint) {
    return { action: "skip" };
  }
  if (
    args.latest?.source === "manual" &&
    args.now.getTime() - args.latest.updatedAt.getTime() <
      (args.idleMs ?? MANUAL_REVISION_IDLE_MS)
  ) {
    return { action: "replace", revisionId: args.latest.id };
  }
  return { action: "insert" };
}

export function mergeManualSummary(existing: string, next: string): string {
  if (!existing || existing === next) return next;
  return "Edited document";
}

export function manualRevisionSummary(
  documentType: DocumentType,
  section: string
): string {
  if (section === DOCUMENT_REVISION_METADATA_SECTION) {
    return "Updated document details";
  }
  const label =
    getWorkspaceSections(documentType).find((row) => row.key === section)
      ?.label ?? section;
  return `Edited ${label}`;
}

async function collectLiveSnapshots(
  tx: RevisionTx,
  reportId: string,
  documentType: DocumentType
): Promise<SectionSnapshot[]> {
  const [reportRow, sectionRows] = await Promise.all([
    tx
      .select({ metadata: reports.metadata })
      .from(reports)
      .where(eq(reports.id, reportId))
      .then((rows) => rows[0]),
    tx
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, reportId)),
  ]);

  const workspace = getWorkspaceSections(documentType);
  const snapshots = workspace.map((section) => {
    const row = sectionRows.find((candidate) => candidate.section === section.key);
    const content = mergeSectionForType(
      documentType,
      section.key,
      row?.content ?? {}
    ) as Record<string, unknown>;
    return {
      section: section.key,
      content,
      contentHash: hashSectionContent(content),
    };
  });
  const metadata = (reportRow?.metadata ?? {}) as Record<string, unknown>;
  snapshots.push({
    section: DOCUMENT_REVISION_METADATA_SECTION,
    content: metadata,
    contentHash: hashSectionContent(metadata),
  });
  return snapshots;
}

async function insertRevision(
  tx: RevisionTx,
  args: {
    reportId: string;
    documentType: DocumentType;
    source: DocumentRevisionSource;
    summary: string;
    createdBy: string | null;
    chatSessionId?: string | null;
    chatMessageId?: string | null;
    snapshots?: SectionSnapshot[];
  }
): Promise<DocumentRevisionRecord> {
  const [latest] = await tx
    .select({ revisionNo: documentRevisions.revisionNo })
    .from(documentRevisions)
    .where(eq(documentRevisions.reportId, args.reportId))
    .orderBy(desc(documentRevisions.revisionNo))
    .limit(1);

  const revisionNo = (latest?.revisionNo ?? 0) + 1;
  const now = new Date();
  const [revision] = await tx
    .insert(documentRevisions)
    .values({
      reportId: args.reportId,
      revisionNo,
      source: args.source,
      chatSessionId: args.chatSessionId ?? null,
      chatMessageId: args.chatMessageId ?? null,
      summary: args.summary,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!revision) {
    throw new Error("Failed to create document revision.");
  }

  const snapshots =
    args.snapshots ??
    (await collectLiveSnapshots(tx, args.reportId, args.documentType));
  await tx.insert(documentRevisionSections).values(
    snapshots.map((snapshot) => ({
      revisionId: revision.id,
      section: snapshot.section,
      content: snapshot.content,
      contentHash: snapshot.contentHash,
    }))
  );
  return revision;
}

export async function snapshotDocumentRevision(args: {
  reportId: string;
  documentType: DocumentType;
  summary: string;
  createdBy: string | null;
  source?: DocumentRevisionSource;
  chatSessionId?: string | null;
  chatMessageId?: string | null;
}): Promise<DocumentRevisionRecord> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.id, args.reportId))
      .for("update");

    return insertRevision(tx, {
      reportId: args.reportId,
      documentType: args.documentType,
      source: args.source ?? "agent_turn",
      summary: args.summary,
      createdBy: args.createdBy,
      chatSessionId: args.chatSessionId,
      chatMessageId: args.chatMessageId,
    });
  });
}

export async function recordManualDocumentRevision(args: {
  reportId: string;
  documentType: DocumentType;
  createdBy: string | null;
  summary: string;
  now?: Date;
  idleMs?: number;
}): Promise<DocumentRevisionRecord | null> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: reports.id })
      .from(reports)
      .where(eq(reports.id, args.reportId))
      .for("update");

    const [latest] = await tx
      .select({
        id: documentRevisions.id,
        source: documentRevisions.source,
        updatedAt: documentRevisions.updatedAt,
        summary: documentRevisions.summary,
      })
      .from(documentRevisions)
      .where(eq(documentRevisions.reportId, args.reportId))
      .orderBy(desc(documentRevisions.revisionNo))
      .limit(1);

    const snapshots = await collectLiveSnapshots(
      tx,
      args.reportId,
      args.documentType
    );
    let latestFingerprint = "";
    if (latest) {
      const stored = await tx
        .select({
          section: documentRevisionSections.section,
          contentHash: documentRevisionSections.contentHash,
        })
        .from(documentRevisionSections)
        .where(eq(documentRevisionSections.revisionId, latest.id));
      latestFingerprint = revisionFingerprint(stored);
    }

    const plan = planManualRevision({
      latest: latest
        ? {
            id: latest.id,
            source: latest.source,
            updatedAt: latest.updatedAt,
            fingerprint: latestFingerprint,
          }
        : null,
      nextFingerprint: revisionFingerprint(snapshots),
      now: args.now ?? new Date(),
      idleMs: args.idleMs,
    });

    switch (plan.action) {
      case "skip":
        return null;
      case "insert":
        return insertRevision(tx, {
          reportId: args.reportId,
          documentType: args.documentType,
          source: "manual",
          summary: args.summary,
          createdBy: args.createdBy,
          snapshots,
        });
      case "replace": {
        const now = args.now ?? new Date();
        await tx
          .delete(documentRevisionSections)
          .where(eq(documentRevisionSections.revisionId, plan.revisionId));
        await tx.insert(documentRevisionSections).values(
          snapshots.map((snapshot) => ({
            revisionId: plan.revisionId,
            section: snapshot.section,
            content: snapshot.content,
            contentHash: snapshot.contentHash,
          }))
        );
        const [updated] = await tx
          .update(documentRevisions)
          .set({
            summary: mergeManualSummary(latest?.summary ?? "", args.summary),
            createdBy: args.createdBy,
            updatedAt: now,
          })
          .where(eq(documentRevisions.id, plan.revisionId))
          .returning();
        if (!updated) {
          throw new Error("Failed to update document revision.");
        }
        return updated;
      }
      default: {
        const exhaustive: never = plan;
        return exhaustive;
      }
    }
  });
}

export async function tryRecordManualDocumentRevision(
  args: Parameters<typeof recordManualDocumentRevision>[0]
): Promise<DocumentRevisionRecord | null> {
  try {
    return await recordManualDocumentRevision(args);
  } catch (err) {
    console.error("document-revisions: failed to record manual revision", err);
    return null;
  }
}
