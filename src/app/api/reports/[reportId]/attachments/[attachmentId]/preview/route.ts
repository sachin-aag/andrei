import { NextResponse } from "next/server";
import { docxBufferToPreviewHtml } from "@/lib/attachments/docx-preview";
import { kindFromMime } from "@/lib/attachments/file-types";
import { loadResolvedReportAttachment } from "@/lib/attachments/sync-asset-processing";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";
/** Reading + converting a large .docx can take a few seconds. */
export const maxDuration = 60;

/**
 * Renders an uploaded `.docx` attachment as read-only HTML for inline preview.
 * Browsers can't render `.docx` natively, so we convert with mammoth on the
 * server. The response is locked down (strict CSP, no scripts) and is intended
 * to be embedded in a sandboxed iframe — it is a viewer, never an editor.
 * The iframe allows popups (and popups escaping the sandbox) so hyperlinks
 * with target=_blank open in a real new tab.
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
  if (kindFromMime(attachment.mimeType) !== "docx") {
    return NextResponse.json(
      { error: "Preview is only available for Word documents" },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const buffer = await getAttachmentStorage().readObjectBuffer(
      attachment.permanentObjectKey
    );
    html = await docxBufferToPreviewHtml(buffer, { title: attachment.filename });
  } catch (error) {
    console.error("[attachment-preview] docx render failed", {
      attachmentId,
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
      // Defense-in-depth alongside the iframe sandbox: no scripts, only inline
      // styles and data: images (mammoth inlines images as data URIs).
      "Content-Security-Policy":
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
