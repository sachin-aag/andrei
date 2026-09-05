import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachmentAssets } from "@/db/schema";
import {
  canManageAttachmentAsset,
  loadAccessibleAsset,
} from "@/lib/attachments/library-access";
import {
  moveLibraryAsset,
  softDeleteLibraryAsset,
} from "@/lib/attachments/library-manage";
import { syncAssetProcessing } from "@/lib/attachments/sync-asset-processing";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    libraryFolderId: z.string().min(1).nullable().optional(),
    uploadFailed: z.literal(true).optional(),
    error: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      data.libraryFolderId !== undefined || data.uploadFailed === true,
    { message: "Expected libraryFolderId or uploadFailed" }
  );

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.uploadFailed) {
    const asset = await loadAccessibleAsset(user, assetId);
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageAttachmentAsset(user, asset)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (asset.processingStatus !== "uploading") {
      return NextResponse.json({ ok: true });
    }
    await syncAssetProcessing(assetId, {
      processingStatus: "failed",
      processingProgress: 0,
      processingError: parsed.data.error?.trim() || "Upload did not complete",
    });
    await db
      .update(attachmentAssets)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(attachmentAssets.id, assetId), isNull(attachmentAssets.deletedAt))
      );
    return NextResponse.json({ ok: true });
  }

  const result = await moveLibraryAsset(
    user,
    assetId,
    parsed.data.libraryFolderId ?? null
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ asset: result.asset });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const result = await softDeleteLibraryAsset(user, assetId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true });
}
