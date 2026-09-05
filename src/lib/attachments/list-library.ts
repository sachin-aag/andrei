import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentAssets,
  attachmentLibraryFolders,
} from "@/db/schema";
import {
  libraryScopeForUser,
  listAccessibleAssetIds,
  type LibraryListScope,
} from "@/lib/attachments/library-access";
import {
  toLibraryAssetDto,
  toLibraryFolderDto,
  type AttachmentLibraryAssetRecord,
  type AttachmentLibraryFolderRecord,
} from "@/lib/attachments/library-dto";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type AttachmentLibrarySnapshot = {
  scope: LibraryListScope;
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
};

function accessKindForAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  asset: Pick<typeof attachmentAssets.$inferSelect, "ownerId">,
  scope: LibraryListScope
): AttachmentLibraryAssetRecord["accessKind"] {
  if (scope === "all") return "all";
  return asset.ownerId === user.id ? "mine" : "shared";
}

export async function listAttachmentLibrary(
  user: Pick<WorkspaceUser, "id" | "role">,
  requestedScope?: LibraryListScope
): Promise<AttachmentLibrarySnapshot> {
  const scope = libraryScopeForUser(user, requestedScope);
  const assetIds = await listAccessibleAssetIds(user, scope);
  if (assetIds.length === 0) {
    return { scope, folders: [], assets: [] };
  }

  const [assets, folders] = await Promise.all([
    db
      .select()
      .from(attachmentAssets)
      .where(
        and(
          inArray(attachmentAssets.id, assetIds),
          isNull(attachmentAssets.deletedAt)
        )
      )
      .orderBy(asc(attachmentAssets.uploadedAt)),
    scope === "all"
      ? db
          .select()
          .from(attachmentLibraryFolders)
          .orderBy(asc(attachmentLibraryFolders.name))
      : db
          .select()
          .from(attachmentLibraryFolders)
          .where(eq(attachmentLibraryFolders.ownerId, user.id))
          .orderBy(asc(attachmentLibraryFolders.name)),
  ]);

  return {
    scope,
    folders: folders.map(toLibraryFolderDto),
    assets: assets.map((asset) =>
      toLibraryAssetDto(asset, accessKindForAsset(user, asset, scope))
    ),
  };
}

export async function listOwnedLibraryAssets(
  ownerId: string
): Promise<AttachmentLibraryAssetRecord[]> {
  const rows = await db
    .select()
    .from(attachmentAssets)
    .where(
      and(eq(attachmentAssets.ownerId, ownerId), isNull(attachmentAssets.deletedAt))
    )
    .orderBy(asc(attachmentAssets.uploadedAt));

  return rows.map((row) => toLibraryAssetDto(row, "mine"));
}
