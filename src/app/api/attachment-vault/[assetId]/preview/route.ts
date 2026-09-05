import { NextResponse } from "next/server";
import { docxBufferToPreviewHtml } from "@/lib/attachments/docx-preview";
import { kindFromMime } from "@/lib/attachments/file-types";
import { loadAccessibleAsset } from "@/lib/attachments/library-access";
import { getCurrentUser } from "@/lib/auth/session";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: Request,
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
  if (kindFromMime(asset.mimeType) !== "docx") {
    return NextResponse.json(
      { error: "Preview is only available for Word documents" },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const buffer = await getAttachmentStorage().readObjectBuffer(
      asset.permanentObjectKey
    );
    html = await docxBufferToPreviewHtml(buffer, { title: asset.filename });
  } catch (error) {
    console.error("[library-asset-preview] docx render failed", {
      assetId,
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
