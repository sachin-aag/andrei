import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import {
  contentRangeHeader,
  parseByteRangeHeader,
  rangeContentLength,
} from "@/lib/attachments/http-byte-range";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";
/** Same-origin preview stream can be multi-minute for large PDFs. */
export const maxDuration = 300;

/** Cap buffered Range bodies so a `bytes=0-` request cannot pull a 200 MB PDF. */
const MAX_BUFFERED_RANGE_BYTES = 8 * 1024 * 1024;

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
  if (page && attachment.pageCount && page > attachment.pageCount) {
    return NextResponse.json({ error: "Page out of range" }, { status: 400 });
  }

  // Downloads can 302 to a signed GCS URL. Inline preview must stay same-origin
  // so pdf.js can Range-request pages. Redirects to storage.googleapis.com are
  // blocked by Comet (and preview hosts are not on the bucket CORS list).
  if (download) {
    try {
      const signedUrl = await getAttachmentStorage().getSignedReadUrl({
        objectKey: attachment.permanentObjectKey,
        generation: attachment.gcsGeneration,
        expiresInSeconds: 5 * 60,
        downloadFilename: attachment.filename,
        responseContentType: attachment.mimeType || undefined,
      });
      const redirectUrl = signedUrl.startsWith("/")
        ? new URL(signedUrl, req.url).toString()
        : signedUrl;
      return NextResponse.redirect(redirectUrl);
    } catch (error) {
      console.error("[attachment-content] signed url failed", {
        attachmentId,
        error,
      });
      return NextResponse.json(
        { error: "Could not create attachment download URL" },
        { status: 502 }
      );
    }
  }

  const sizeBytes = await resolvedObjectSizeBytes(
    attachment.permanentObjectKey,
    attachment.sizeBytes
  );
  const parsedRange = parseByteRangeHeader(req.headers.get("Range"), sizeBytes);
  switch (parsedRange.kind) {
    case "full":
    case "partial":
      break;
    case "unsatisfiable":
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes */${sizeBytes}`,
        },
      });
    default: {
      const _exhaustive: never = parsedRange;
      return _exhaustive;
    }
  }

  const byteRange =
    parsedRange.kind === "partial"
      ? { start: parsedRange.start, end: parsedRange.end }
      : undefined;
  if (byteRange && rangeContentLength(byteRange) > MAX_BUFFERED_RANGE_BYTES) {
    return NextResponse.json({ error: "Range too large" }, { status: 400 });
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await getAttachmentStorage().openObjectReadStream(
      attachment.permanentObjectKey,
      byteRange
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
    "Content-Type": attachment.mimeType || "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Content-Encoding": "identity",
    "X-Content-Type-Options": "nosniff",
  });
  if (attachment.gcsGeneration) {
    headers.set("ETag", `"${attachment.gcsGeneration}"`);
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Content-Length",
    String(byteRange ? rangeContentLength(byteRange) : sizeBytes)
  );
  if (byteRange) {
    headers.set("Content-Range", contentRangeHeader(byteRange, sizeBytes));
  }

  // Buffer Range bodies. Streamed NextResponse often drops Content-Length,
  // which makes pdf.js's url-loader treat the file as non-ranged.
  if (byteRange) {
    try {
      const body = await bufferWebStream(stream);
      return new NextResponse(Buffer.from(body), { status: 206, headers });
    } catch (error) {
      console.error("[attachment-content] buffer range failed", {
        attachmentId,
        error,
      });
      return NextResponse.json(
        { error: "Could not load attachment content" },
        { status: 502 }
      );
    }
  }

  return new NextResponse(stream, {
    status: 200,
    headers,
  });
}

async function resolvedObjectSizeBytes(
  objectKey: string,
  storedSizeBytes: number
): Promise<number> {
  if (storedSizeBytes > 0) return storedSizeBytes;
  try {
    const metadata = await getAttachmentStorage().getObjectMetadata(objectKey);
    return metadata.sizeBytes;
  } catch {
    return 0;
  }
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

async function bufferWebStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
