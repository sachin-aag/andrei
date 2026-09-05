import { NextResponse } from "next/server";
import { loadAccessibleAsset } from "@/lib/attachments/library-access";
import { serveStoredAttachmentContent } from "@/lib/attachments/serve-attachment-content";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const asset = await loadAccessibleAsset(user, assetId);
  if (!asset?.gcsGeneration || !asset.permanentObjectKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return serveStoredAttachmentContent(
    req,
    {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      permanentObjectKey: asset.permanentObjectKey,
      gcsGeneration: asset.gcsGeneration,
      pageCount: asset.pageCount,
    },
    "library-asset-content"
  );
}
