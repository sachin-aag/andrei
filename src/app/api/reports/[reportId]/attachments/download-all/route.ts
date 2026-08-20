import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAttachmentsDownloadZip } from "@/lib/attachments/download-all-zip";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";
/** Large reports can stream many PDFs; keep this in line with ingest. */
export const maxDuration = 300;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const zip = await loadAttachmentsDownloadZip(
    reportId,
    access.report.documentNo
  );
  if (!zip) {
    return NextResponse.json(
      { error: "No documents are ready to download" },
      { status: 404 }
    );
  }

  return new NextResponse(zip.stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
