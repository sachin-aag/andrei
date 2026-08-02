import { NextResponse } from "next/server";
import {
  isLocalAttachmentStorageEnabled,
  LocalAttachmentStorage,
} from "@/lib/storage/attachments";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isLocalAttachmentStorageEnabled()) {
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
  const download = url.searchParams.get("download") === "1";
  const filename =
    url.searchParams.get("filename")?.replace(/["\r\n]/g, "_") || "document.pdf";
  const headers: Record<string, string> = {
    "Content-Type": metadata.contentType,
    "Content-Length": String(buffer.byteLength),
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }
  return new Response(new Uint8Array(buffer), { headers });
}
