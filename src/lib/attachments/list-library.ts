import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
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
import { liveAncestorFolders } from "@/lib/attachments/library-shared-tree";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export type AttachmentLibrarySnapshot = {
  scope: LibraryListScope;
  folders: AttachmentLibraryFolderRecord[];
  assets: AttachmentLibraryAssetRecord[];
  archivedFolders: AttachmentLibraryFolderRecord[];
  archivedAssets: AttachmentLibraryAssetRecord[];
};

function accessKindForAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  asset: Pick<typeof attachmentAssets.$inferSelect, "ownerId">,
  scope: LibraryListScope
): AttachmentLibraryAssetRecord["accessKind"] {
  switch (scope) {
    case "all":
      return "all";
    case "mine":
    case "shared":
    case "accessible":
      return asset.ownerId === user.id ? "mine" : "shared";
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}

async function listOwnedLiveFolders(ownerId: string) {
  return db
    .select()
    .from(attachmentLibraryFolders)
    .where(
      and(
        eq(attachmentLibraryFolders.ownerId, ownerId),
        isNull(attachmentLibraryFolders.archivedAt)
      )
    )
    .orderBy(asc(attachmentLibraryFolders.name));
}

async function listLiveAncestorFoldersForSharedAssets(
  sharedAssets: Pick<typeof attachmentAssets.$inferSelect, "libraryFolderId" | "ownerId">[]
) {
  const ownerIds = [...new Set(sharedAssets.map((asset) => asset.ownerId))];
  if (ownerIds.length === 0) return [];

  const candidates = await db
    .select()
    .from(attachmentLibraryFolders)
    .where(
      and(
        inArray(attachmentLibraryFolders.ownerId, ownerIds),
        isNull(attachmentLibraryFolders.archivedAt)
      )
    )
    .orderBy(asc(attachmentLibraryFolders.name));

  return liveAncestorFolders(sharedAssets, candidates);
}

function mergeFoldersById(
  ...groups: (typeof attachmentLibraryFolders.$inferSelect)[][]
) {
  const byId = new Map<string, (typeof attachmentLibraryFolders.$inferSelect)>();
  for (const group of groups) {
    for (const folder of group) {
      byId.set(folder.id, folder);
    }
  }
  return [...byId.values()].toSorted((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function listAttachmentLibrary(
  user: Pick<WorkspaceUser, "id" | "role">,
  requestedScope?: LibraryListScope
): Promise<AttachmentLibrarySnapshot> {
  const scope = libraryScopeForUser(user, requestedScope);
  const assetIds = await listAccessibleAssetIds(user, scope);

  const [assets, ownedFolders, archivedAssets, archivedFolders] =
    await Promise.all([
      assetIds.length === 0
        ? Promise.resolve([])
        : db
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
            .where(isNull(attachmentLibraryFolders.archivedAt))
            .orderBy(asc(attachmentLibraryFolders.name))
        : scope === "shared"
          ? Promise.resolve([])
          : listOwnedLiveFolders(user.id),
      db
        .select()
        .from(attachmentAssets)
        .where(
          and(
            eq(attachmentAssets.ownerId, user.id),
            isNotNull(attachmentAssets.deletedAt)
          )
        )
        .orderBy(asc(attachmentAssets.uploadedAt)),
      db
        .select()
        .from(attachmentLibraryFolders)
        .where(
          and(
            eq(attachmentLibraryFolders.ownerId, user.id),
            isNotNull(attachmentLibraryFolders.archivedAt)
          )
        )
        .orderBy(asc(attachmentLibraryFolders.name)),
    ]);

  const sharedAssets = assets.filter((asset) => asset.ownerId !== user.id);
  const sharedFolders =
    scope === "shared" || scope === "accessible"
      ? await listLiveAncestorFoldersForSharedAssets(sharedAssets)
      : [];
  const folders =
    scope === "all" ? ownedFolders : mergeFoldersById(ownedFolders, sharedFolders);

  return {
    scope,
    folders: folders.map(toLibraryFolderDto),
    assets: assets.map((asset) =>
      toLibraryAssetDto(asset, accessKindForAsset(user, asset, scope))
    ),
    archivedFolders: archivedFolders.map(toLibraryFolderDto),
    archivedAssets: archivedAssets.map((asset) =>
      toLibraryAssetDto(asset, "mine")
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
