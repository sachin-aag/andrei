import { NextResponse } from "next/server";
import {
  appendLocalUploadChunk,
  isLocalAttachmentStorageEnabled,
} from "@/lib/storage/attachments";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!isLocalAttachmentStorageEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { sessionId } = await params;
  const buffer = Buffer.from(await req.arrayBuffer());
  try {
    const result = await appendLocalUploadChunk(
      sessionId,
      buffer,
      req.headers.get("content-range")
    );
    if (result.complete) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, {
      status: 308,
      headers:
        result.receivedBytes > 0
          ? { Range: `bytes=0-${result.receivedBytes - 1}` }
          : {},
    });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 400 });
  }
}
