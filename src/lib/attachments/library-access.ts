import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentAccessGrants,
  attachmentAssets,
} from "@/db/schema";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

export function isWorkspaceAdmin(user: Pick<WorkspaceUser, "role">): boolean {
  return user.role === "admin";
}

/** Owner, explicit grant, or workspace admin. */
export async function canAccessAttachmentAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string
): Promise<boolean> {
  if (isWorkspaceAdmin(user)) return true;

  const [row] = await db
    .select({ id: attachmentAssets.id })
    .from(attachmentAssets)
    .leftJoin(
      attachmentAccessGrants,
      and(
        eq(attachmentAccessGrants.assetId, attachmentAssets.id),
        eq(attachmentAccessGrants.granteeUserId, user.id)
      )
    )
    .where(
      and(
        eq(attachmentAssets.id, assetId),
        isNull(attachmentAssets.deletedAt),
        or(
          eq(attachmentAssets.ownerId, user.id),
          eq(attachmentAccessGrants.granteeUserId, user.id)
        )
      )
    )
    .limit(1);

  return row != null;
}

/** Only the owner (or admin) may edit metadata or manage grants. */
export function canManageAttachmentAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  asset: Pick<typeof attachmentAssets.$inferSelect, "ownerId">
): boolean {
  return isWorkspaceAdmin(user) || asset.ownerId === user.id;
}

export async function loadAccessibleAsset(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string
) {
  if (isWorkspaceAdmin(user)) {
    const [asset] = await db
      .select()
      .from(attachmentAssets)
      .where(
        and(eq(attachmentAssets.id, assetId), isNull(attachmentAssets.deletedAt))
      )
      .limit(1);
    return asset ?? null;
  }

  const [asset] = await db
    .select({ asset: attachmentAssets })
    .from(attachmentAssets)
    .leftJoin(
      attachmentAccessGrants,
      and(
        eq(attachmentAccessGrants.assetId, attachmentAssets.id),
        eq(attachmentAccessGrants.granteeUserId, user.id)
      )
    )
    .where(
      and(
        eq(attachmentAssets.id, assetId),
        isNull(attachmentAssets.deletedAt),
        or(
          eq(attachmentAssets.ownerId, user.id),
          eq(attachmentAccessGrants.granteeUserId, user.id)
        )
      )
    )
    .limit(1);

  return asset?.asset ?? null;
}

export type LibraryListScope = "mine" | "shared" | "all";

export function libraryScopeForUser(
  user: Pick<WorkspaceUser, "role">,
  requested?: LibraryListScope
): LibraryListScope {
  if (isWorkspaceAdmin(user)) {
    return requested === "mine" || requested === "shared" ? requested : "all";
  }
  return requested === "shared" ? "shared" : "mine";
}

export async function listAccessibleAssetIds(
  user: Pick<WorkspaceUser, "id" | "role">,
  scope: LibraryListScope
): Promise<string[]> {
  if (scope === "all" && isWorkspaceAdmin(user)) {
    const rows = await db
      .select({ id: attachmentAssets.id })
      .from(attachmentAssets)
      .where(isNull(attachmentAssets.deletedAt));
    return rows.map((row) => row.id);
  }

  if (scope === "shared") {
    const rows = await db
      .select({ id: attachmentAssets.id })
      .from(attachmentAssets)
      .innerJoin(
        attachmentAccessGrants,
        eq(attachmentAccessGrants.assetId, attachmentAssets.id)
      )
      .where(
        and(
          eq(attachmentAccessGrants.granteeUserId, user.id),
          isNull(attachmentAssets.deletedAt)
        )
      );
    return rows.map((row) => row.id);
  }

  const rows = await db
    .select({ id: attachmentAssets.id })
    .from(attachmentAssets)
    .where(
      and(
        eq(attachmentAssets.ownerId, user.id),
        isNull(attachmentAssets.deletedAt)
      )
    );
  return rows.map((row) => row.id);
}

export async function assertAssetAccessible(
  user: Pick<WorkspaceUser, "id" | "role">,
  assetId: string
): Promise<typeof attachmentAssets.$inferSelect | null> {
  const asset = await loadAccessibleAsset(user, assetId);
  return asset;
}

export async function countAssetsOwnedByUser(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attachmentAssets)
    .where(
      and(eq(attachmentAssets.ownerId, ownerId), isNull(attachmentAssets.deletedAt))
    );
  return row?.count ?? 0;
}
