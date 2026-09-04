import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { attachmentAssets } from "@/db/schema";
import { toLibraryAssetDto } from "@/lib/attachments/library-dto";
import {
  canManageAttachmentAsset,
  loadAccessibleAsset,
} from "@/lib/attachments/library-access";
import { loadLibraryFolder } from "@/lib/attachments/library-folders";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type ManageAssetResult =
  | { ok: true; asset: ReturnType<typeof toLibraryAssetDto> }
  | { ok: false; error: string; status: 400 | 403 | 404 };

export async function moveLibraryAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string,
  libraryFolderId: string | null
): Promise<ManageAssetResult> {
  const asset = await loadAccessibleAsset(user, assetId);
  if (!asset) {
    return { ok: false, error: "Not found", status: 404 };
  }
  if (!canManageAttachmentAsset(user, asset)) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  if (libraryFolderId != null) {
    const folder = await loadLibraryFolder(user.id, libraryFolderId);
    if (!folder) {
      return { ok: false, error: "Folder not found", status: 404 };
    }
  }

  const [updated] = await db
    .update(attachmentAssets)
    .set({ libraryFolderId })
    .where(
      and(
        eq(attachmentAssets.id, assetId),
        isNull(attachmentAssets.deletedAt)
      )
    )
    .returning();

  if (!updated) {
    return { ok: false, error: "Not found", status: 404 };
  }

  return { ok: true, asset: toLibraryAssetDto(updated, "mine") };
}

/** Soft-delete removes the file from the library UI only; report links stay. */
export async function softDeleteLibraryAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string
): Promise<{ ok: true } | { ok: false; error: string; status: 403 | 404 }> {
  const asset = await loadAccessibleAsset(user, assetId);
  if (!asset) {
    return { ok: false, error: "Not found", status: 404 };
  }
  if (!canManageAttachmentAsset(user, asset)) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  await db
    .update(attachmentAssets)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(attachmentAssets.id, assetId),
        isNull(attachmentAssets.deletedAt)
      )
    );

  return { ok: true };
}
