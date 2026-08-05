import { and, eq, isNull } from "drizzle-orm";
import PizZip from "pizzip";
import { db } from "@/db";
import {
  comments,
  reportAttachments,
  reportSections,
  reports,
  sectionContentVersions,
} from "@/db/schema";
import {
  exportAuditEventsCsv,
  exportAuditEventsPdf,
} from "@/lib/audit/export";
import { listAuditEvents, listReportSignatures } from "@/lib/audit/queries";
import { generateReportDocx } from "@/lib/export/generate-docx";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import {
  buildAttachmentEvidenceManifestFromRows,
  type AttachmentEvidenceManifestEntry,
} from "@/lib/reports/compute-content-hash";
import { getAttachmentStorage } from "@/lib/storage/attachments";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportMetadataXml(
  report: typeof reports.$inferSelect & { assignedManagerIds: string[] },
  signatures: Awaited<ReturnType<typeof listReportSignatures>>,
  evidenceSources: EvidenceSourceExportEntry[]
): string {
  const lines = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<CompleteRecordExport>",
    "  <Report>",
    `    <Id>${escapeXml(report.id)}</Id>`,
    `    <DeviationNo>${escapeXml(report.deviationNo)}</DeviationNo>`,
    `    <Status>${escapeXml(report.status)}</Status>`,
    `    <AuthorId>${escapeXml(report.authorId)}</AuthorId>`,
    `    <CreatedAt>${report.createdAt.toISOString()}</CreatedAt>`,
    `    <UpdatedAt>${report.updatedAt.toISOString()}</UpdatedAt>`,
    report.deletedAt
      ? `    <DeletedAt>${report.deletedAt.toISOString()}</DeletedAt>`
      : "",
    "  </Report>",
    "  <ElectronicSignatures>",
    ...signatures.map(
      (sig) =>
        `    <Signature meaning="${escapeXml(sig.meaning)}" signer="${escapeXml(sig.signerName)}" signedAt="${sig.signedAt.toISOString()}" contentHash="${escapeXml(sig.contentHash ?? "")}" />`
    ),
    "  </ElectronicSignatures>",
    "  <AttachmentEvidenceManifest>",
    ...evidenceSources.map((source) =>
      [
        `    <Attachment attachmentId="${escapeXml(source.attachmentId)}">`,
        `      <Filename>${escapeXml(source.filename)}</Filename>`,
        `      <SizeBytes>${source.sizeBytes}</SizeBytes>`,
        `      <Sha256>${escapeXml(source.sha256)}</Sha256>`,
        source.gcsGeneration
          ? `      <GcsGeneration>${escapeXml(source.gcsGeneration)}</GcsGeneration>`
          : "",
        `      <UploadedAt>${escapeXml(source.uploadedAt)}</UploadedAt>`,
        source.downloadUrl
          ? `      <SourceDownload expiresAt="${escapeXml(source.downloadExpiresAt)}">${escapeXml(source.downloadUrl)}</SourceDownload>`
          : "",
        `      <SourceNote>${escapeXml(source.sourceNote)}</SourceNote>`,
        "    </Attachment>",
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "  </AttachmentEvidenceManifest>",
    "</CompleteRecordExport>",
  ];
  return lines.filter(Boolean).join("\n");
}

type AttachmentExportRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  gcsGeneration: string | null;
  uploadedAt: Date;
  permanentObjectKey: string;
};

type EvidenceSourceExportEntry = AttachmentEvidenceManifestEntry & {
  downloadUrl: string | null;
  downloadExpiresAt: string;
  sourceNote: string;
};

const SOURCE_LINK_TTL_SECONDS = 15 * 60;

async function buildEvidenceSourceExportEntries(
  rows: AttachmentExportRow[]
): Promise<EvidenceSourceExportEntry[]> {
  const manifest = buildAttachmentEvidenceManifestFromRows(rows);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const downloadExpiresAt = new Date(
    Date.now() + SOURCE_LINK_TTL_SECONDS * 1000
  ).toISOString();

  return Promise.all(
    manifest.map(async (entry) => {
      const row = rowsById.get(entry.attachmentId);
      if (!row?.gcsGeneration) {
        return {
          ...entry,
          downloadUrl: null,
          downloadExpiresAt,
          sourceNote:
            "Source PDF was not embedded in this ZIP. No signed source link is available because the attachment is not finalized.",
        };
      }

      const downloadUrl = await getAttachmentStorage().getSignedReadUrl({
        objectKey: row.permanentObjectKey,
        generation: row.gcsGeneration,
        expiresInSeconds: SOURCE_LINK_TTL_SECONDS,
      });

      return {
        ...entry,
        downloadUrl,
        downloadExpiresAt,
        sourceNote:
          "Source PDF is available through the signed link until it expires. PDF binaries are intentionally not embedded in the ZIP; async evidence export is a follow-up for larger records.",
      };
    })
  );
}

export type CompleteRecordExportOptions = {
  /** Audit trail artifacts are admin-only (see /api/reports/[reportId]/audit/export). */
  includeAuditTrail?: boolean;
};

export async function buildCompleteRecordExportZip(
  reportId: string,
  options: CompleteRecordExportOptions = {}
) {
  const includeAuditTrail = options.includeAuditTrail ?? false;
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return null;

  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);

  const [sectionRows, commentRows, signatures, versions, attachmentRows] =
    await Promise.all([
      db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
      db.select().from(comments).where(eq(comments.reportId, reportId)),
      listReportSignatures(reportId),
      db
        .select()
        .from(sectionContentVersions)
        .where(eq(sectionContentVersions.reportId, reportId)),
      db
        .select({
          id: reportAttachments.id,
          filename: reportAttachments.filename,
          sizeBytes: reportAttachments.sizeBytes,
          sha256: reportAttachments.sha256,
          gcsGeneration: reportAttachments.gcsGeneration,
          uploadedAt: reportAttachments.uploadedAt,
          permanentObjectKey: reportAttachments.permanentObjectKey,
        })
        .from(reportAttachments)
        .where(
          and(
            eq(reportAttachments.reportId, reportId),
            isNull(reportAttachments.deletedAt)
          )
        ),
    ]);

  const auditArtifactsPromise = includeAuditTrail
    ? listAuditEvents({ reportId, limit: 10_000 }).then(async (auditEvents) => ({
        auditCsv: await exportAuditEventsCsv(auditEvents),
        auditPdf: await exportAuditEventsPdf(auditEvents),
      }))
    : Promise.resolve(null);

  const [auditArtifacts, investigationDocx, evidenceSources] = await Promise.all([
    auditArtifactsPromise,
    generateReportDocx({
      report: reportWithManagers,
      sections: sectionRows.map((row) => ({
        id: row.id,
        reportId: row.reportId,
        section: row.section,
        content: row.content,
        updatedAt: row.updatedAt.toISOString(),
      })),
      comments: commentRows,
      electronicSignatures: signatures.map((sig) => ({
        signerName: sig.signerName,
        meaning: sig.meaning,
        signedAt: sig.signedAt,
        contentHash: sig.contentHash,
      })),
    }),
    buildEvidenceSourceExportEntries(attachmentRows),
  ]);

  const metadataXml = reportMetadataXml(
    reportWithManagers,
    signatures,
    evidenceSources
  );
  const versionHistoryCsv = [
    "section,version_no,is_snapshot,content_hash,created_at",
    ...versions.map(
      (v) =>
        `${v.section},${v.versionNo},${v.isSnapshot},${v.contentHash},${v.createdAt.toISOString()}`
    ),
  ].join("\n");

  const zip = new PizZip();
  zip.file("metadata.xml", metadataXml);
  if (auditArtifacts) {
    zip.file("audit-trail.csv", auditArtifacts.auditCsv);
    zip.file("audit-trail.pdf", auditArtifacts.auditPdf);
  }
  zip.file("version-history.csv", versionHistoryCsv);
  zip.file("investigation-report.docx", investigationDocx);

  return {
    buffer: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }),
    deviationNo: report.deviationNo,
  };
}
