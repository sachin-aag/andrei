import { NextResponse } from "next/server";
import { loadResolvedReportAttachment } from "@/lib/attachments/sync-asset-processing";
import { serveStoredAttachmentContent } from "@/lib/attachments/serve-attachment-content";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, attachmentId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const loaded = await loadResolvedReportAttachment(reportId, attachmentId);
  const gcsGeneration = loaded?.resolved.gcsGeneration;
  if (!loaded || !gcsGeneration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { resolved: attachment } = loaded;
  if (!attachment.permanentObjectKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return serveStoredAttachmentContent(
    req,
    {
      id: attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      permanentObjectKey: attachment.permanentObjectKey,
      gcsGeneration,
      pageCount: attachment.pageCount,
    },
    "attachment-content"
  );
}
