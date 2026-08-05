import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";
/** Fallback proxy stream can be multi-minute for large PDFs. */
export const maxDuration = 60;

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

  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );
  if (!attachment || !attachment.gcsGeneration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!attachment.permanentObjectKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const searchParams = new URL(req.url).searchParams;
  const page = normalizedPage(searchParams.get("page"));
  const download = searchParams.get("download") === "1";
  const proxy = searchParams.get("proxy") === "1";
  if (page && attachment.pageCount && page > attachment.pageCount) {
    return NextResponse.json({ error: "Page out of range" }, { status: 400 });
  }

  if (!proxy) {
    try {
      const signedUrl = await getAttachmentStorage().getSignedReadUrl({
        objectKey: attachment.permanentObjectKey,
        generation: attachment.gcsGeneration,
        expiresInSeconds: 5 * 60,
        downloadFilename: download ? attachment.filename : undefined,
      });
      const redirectUrl = signedUrl.startsWith("/")
        ? new URL(signedUrl, req.url).toString()
        : signedUrl;
      return NextResponse.redirect(
        download ? redirectUrl : appendPageFragment(redirectUrl, page)
      );
    } catch (error) {
      console.error("[attachment-content] signed url failed", {
        attachmentId,
        error,
      });
      if (download) {
        return NextResponse.json(
          { error: "Could not create attachment download URL" },
          { status: 502 }
        );
      }
    }
  }

  // Fallback: stream through the app when signed URLs are unavailable. This is
  // less efficient than GCS direct access and should not be the primary path.
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await getAttachmentStorage().openObjectReadStream(
      attachment.permanentObjectKey
    );
  } catch (error) {
    console.error("[attachment-content] open stream failed", {
      attachmentId,
      error,
    });
    return NextResponse.json(
      { error: "Could not load attachment content" },
      { status: 502 }
    );
  }

  const filename = safeFilename(attachment.filename);
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": download
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`,
    // Help browsers treat this as embeddable PDF content.
    "X-Content-Type-Options": "nosniff",
  });

  return new NextResponse(stream, { status: 200, headers });
}

function normalizedPage(raw: string | null): number | null {
  if (!raw) return null;
  const page = Number(raw);
  if (!Number.isInteger(page) || page <= 0) return null;
  return page;
}

function safeFilename(filename: string): string {
  return filename.replace(/["\r\n]/g, "_") || "document.pdf";
}

function appendPageFragment(url: string, page: number | null): string {
  if (!page) return url;
  const withoutFragment = url.split("#")[0];
  return `${withoutFragment}#page=${page}`;
}
