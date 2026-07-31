import { NextResponse } from "next/server";
import { LocalAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ATTACHMENT_STORAGE_BACKEND !== "local" ||
    process.env.ALLOW_LOCAL_ATTACHMENT_STORAGE !== "true"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const objectKey = url.searchParams.get("key");
  const generation = url.searchParams.get("generation");
  const expiresAt = Number(url.searchParams.get("expiresAt"));
  if (!objectKey || !generation || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return NextResponse.json({ error: "Expired" }, { status: 403 });
  }

  const storage = new LocalAttachmentStorage();
  const metadata = await storage.getObjectMetadata(objectKey).catch(() => null);
  if (!metadata || metadata.generation !== generation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await storage.readObjectBuffer(objectKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": metadata.contentType,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
