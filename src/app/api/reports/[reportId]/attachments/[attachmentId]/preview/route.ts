import { NextResponse } from "next/server";
import { attachmentBufferToPreviewHtml } from "@/lib/attachments/html-preview";
import { kindFromMime, usesHtmlPreview } from "@/lib/attachments/file-types";
import { loadResolvedReportAttachment } from "@/lib/attachments/sync-asset-processing";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";
/** Reading + converting a large .docx / spreadsheet can take a few seconds. */
export const maxDuration = 60;

/**
 * Renders Word / CSV / Excel attachments as read-only HTML for inline preview.
 * The response is locked down (strict CSP, no scripts) and is intended to be
 * embedded in a sandboxed iframe — it is a viewer, never an editor.
 */
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
  if (!loaded || !loaded.resolved.gcsGeneration || !loaded.resolved.permanentObjectKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { resolved: attachment } = loaded;
  const kind = kindFromMime(attachment.mimeType);
  if (!usesHtmlPreview(kind) || !kind) {
    return NextResponse.json(
      { error: "Preview is only available for Word, CSV, and Excel files" },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const buffer = await getAttachmentStorage().readObjectBuffer(
      attachment.permanentObjectKey
    );
    html = await attachmentBufferToPreviewHtml(kind, buffer, {
      title: attachment.filename,
    });
  } catch (error) {
    console.error("[attachment-preview] html render failed", {
      attachmentId,
      kind,
      error,
    });
    return NextResponse.json(
      { error: "Could not render document preview" },
      { status: 502 }
    );
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}