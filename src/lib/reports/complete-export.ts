import { eq } from "drizzle-orm";
import PizZip from "pizzip";
import { db } from "@/db";
import {
  comments,
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportMetadataXml(
  report: typeof reports.$inferSelect & { assignedManagerIds: string[] },
  signatures: Awaited<ReturnType<typeof listReportSignatures>>
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
    "</CompleteRecordExport>",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function buildCompleteRecordExportZip(reportId: string) {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return null;

  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);

  const [sectionRows, commentRows, auditEvents, signatures, versions] =
    await Promise.all([
      db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
      db.select().from(comments).where(eq(comments.reportId, reportId)),
      listAuditEvents({ reportId, limit: 10_000 }),
      listReportSignatures(reportId),
      db
        .select()
        .from(sectionContentVersions)
        .where(eq(sectionContentVersions.reportId, reportId)),
    ]);

  const [auditCsv, auditPdf, investigationDocx] = await Promise.all([
    exportAuditEventsCsv(auditEvents),
    exportAuditEventsPdf(auditEvents),
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
  ]);

  const metadataXml = reportMetadataXml(reportWithManagers, signatures);
  const versionHistoryCsv = [
    "section,version_no,is_snapshot,content_hash,created_at",
    ...versions.map(
      (v) =>
        `${v.section},${v.versionNo},${v.isSnapshot},${v.contentHash},${v.createdAt.toISOString()}`
    ),
  ].join("\n");

  const zip = new PizZip();
  zip.file("metadata.xml", metadataXml);
  zip.file("audit-trail.csv", auditCsv);
  zip.file("audit-trail.pdf", auditPdf);
  zip.file("version-history.csv", versionHistoryCsv);
  zip.file("investigation-report.docx", investigationDocx);

  return {
    buffer: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }),
    deviationNo: report.deviationNo,
  };
}
