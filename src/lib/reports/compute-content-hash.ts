import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  reportAttachments,
  reportSections,
  type AttachmentProcessingStatus,
} from "@/db/schema";
import { hashSectionContent } from "@/lib/audit/content-hash";
import type { SectionContentMap } from "@/types/sections";

export type AttachmentEvidenceManifestEntry = {
  attachmentId: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  gcsGeneration: string | null;
  uploadedAt: string;
};

export type AttachmentSubmissionReadiness =
  | { ok: true }
  | {
      ok: false;
      message: string;
      attachments: Array<{
        attachmentId: string;
        filename: string;
        processingStatus: AttachmentProcessingStatus;
      }>;
    };

export async function loadReportSectionContentMap(
  reportId: string
): Promise<Partial<SectionContentMap>> {
  const rows = await db
    .select({
      section: reportSections.section,
      content: reportSections.content,
    })
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const map: Partial<SectionContentMap> = {};
  for (const row of rows) {
    (map as Record<string, unknown>)[row.section] = row.content;
  }
  return map;
}

export function buildAttachmentEvidenceManifestFromRows(
  rows: Array<{
    id: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    gcsGeneration: string | null;
    uploadedAt: Date | string;
  }>
): AttachmentEvidenceManifestEntry[] {
  return rows
    .map((row) => ({
      attachmentId: row.id,
      filename: row.filename,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      gcsGeneration: row.gcsGeneration,
      uploadedAt:
        row.uploadedAt instanceof Date
          ? row.uploadedAt.toISOString()
          : new Date(row.uploadedAt).toISOString(),
    }))
    .sort((a, b) => {
      const uploadedAt = a.uploadedAt.localeCompare(b.uploadedAt);
      if (uploadedAt !== 0) return uploadedAt;
      const filename = a.filename.localeCompare(b.filename);
      if (filename !== 0) return filename;
      return a.attachmentId.localeCompare(b.attachmentId);
    });
}

export async function buildAttachmentEvidenceManifest(
  reportId: string
): Promise<AttachmentEvidenceManifestEntry[]> {
  const rows = await db
    .select({
      id: reportAttachments.id,
      filename: reportAttachments.filename,
      sizeBytes: reportAttachments.sizeBytes,
      sha256: reportAttachments.sha256,
      gcsGeneration: reportAttachments.gcsGeneration,
      uploadedAt: reportAttachments.uploadedAt,
    })
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );

  return buildAttachmentEvidenceManifestFromRows(rows);
}

export async function assertAttachmentsReadyForSubmission(
  reportId: string
): Promise<AttachmentSubmissionReadiness> {
  const rows = await db
    .select({
      id: reportAttachments.id,
      filename: reportAttachments.filename,
      processingStatus: reportAttachments.processingStatus,
    })
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );

  const notReady = rows
    .filter((row) => row.processingStatus !== "ready")
    .map((row) => ({
      attachmentId: row.id,
      filename: row.filename,
      processingStatus: row.processingStatus,
    }));

  if (notReady.length > 0) {
    return {
      ok: false,
      message:
        "All active attachments must finish processing before this report can be submitted.",
      attachments: notReady,
    };
  }

  return { ok: true };
}

export async function computeReportContentHash(reportId: string): Promise<string> {
  const [sections, attachmentEvidenceManifest] = await Promise.all([
    loadReportSectionContentMap(reportId),
    buildAttachmentEvidenceManifest(reportId),
  ]);

  return hashSectionContent({
    sections,
    attachmentEvidenceManifest,
  });
}

export async function computeReportVersionSeq(reportId: string): Promise<number> {
  const rows = await db.query.sectionContentVersions.findMany({
    where: (t, { eq }) => eq(t.reportId, reportId),
    columns: { versionNo: true },
  });
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((row) => row.versionNo));
}
