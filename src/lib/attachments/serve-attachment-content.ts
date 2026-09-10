import { NextResponse } from "next/server";
import {
  contentRangeHeader,
  parseByteRangeHeader,
  rangeContentLength,
} from "@/lib/attachments/http-byte-range";
import { getAttachmentStorage } from "@/lib/storage/attachments";

/** Cap buffered Range bodies so a `bytes=0-` request cannot pull a 200 MB PDF. */
const MAX_BUFFERED_RANGE_BYTES = 8 * 1024 * 1024;

const PREVIEW_CACHE_CONTROL = "private, max-age=3600, must-revalidate";

function directPreviewStorageEnabled(): boolean {
  return process.env.ATTACHMENT_PREVIEW_DIRECT_STORAGE === "true";
}

function requestMatchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  const candidates = header.split(",").map((value) => value.trim());
  if (candidates.includes("*")) return true;
  const normalize = (value: string) =>
    value.startsWith("W/") ? value.slice(2) : value;
  return candidates.some((value) => normalize(value) === normalize(etag));
}

export type StoredAttachmentBytes = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  permanentObjectKey: string;
  gcsGeneration: string;
  pageCount: number | null;
};

export async function serveStoredAttachmentContent(
  req: Request,
  attachment: StoredAttachmentBytes,
  logTag: string
): Promise<Response> {
  const searchParams = new URL(req.url).searchParams;
  const page = normalizedPage(searchParams.get("page"));
  const download = searchParams.get("download") === "1";
  if (page && attachment.pageCount && page > attachment.pageCount) {
    return NextResponse.json({ error: "Page out of range" }, { status: 400 });
  }

  const etag = `"${attachment.gcsGeneration}"`;
  if (!download && requestMatchesEtag(req.headers.get("If-None-Match"), etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": PREVIEW_CACHE_CONTROL,
        "Accept-Ranges": "bytes",
      },
    });
  }

  if (download || directPreviewStorageEnabled()) {
    try {
      const signedUrl = await getAttachmentStorage().getSignedReadUrl({
        objectKey: attachment.permanentObjectKey,
        generation: attachment.gcsGeneration,
        expiresInSeconds: 5 * 60,
        ...(download ? { downloadFilename: attachment.filename } : {}),
        responseContentType: attachment.mimeType || undefined,
      });
      const redirectUrl = signedUrl.startsWith("/")
        ? new URL(signedUrl, req.url).toString()
        : signedUrl;
      const redirect = NextResponse.redirect(redirectUrl);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    } catch (error) {
      console.error(`[${logTag}] signed url failed`, {
        attachmentId: attachment.id,
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
    console.error(`[${logTag}] open stream failed`, {
      attachmentId: attachment.id,
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
    "Cache-Control": PREVIEW_CACHE_CONTROL,
    "Content-Disposition": `inline; filename="${filename}"`,
    "Content-Encoding": "identity",
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
  });
  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Content-Length",
    String(byteRange ? rangeContentLength(byteRange) : sizeBytes)
  );
  if (byteRange) {
    headers.set("Content-Range", contentRangeHeader(byteRange, sizeBytes));
  }

  if (byteRange) {
    try {
      const body = await bufferWebStream(stream);
      return new NextResponse(Buffer.from(body), { status: 206, headers });
    } catch (error) {
      console.error(`[${logTag}] buffer range failed`, {
        attachmentId: attachment.id,
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
