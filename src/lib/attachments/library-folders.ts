import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachmentLibraryFolders } from "@/db/schema";
import { toLibraryFolderDto } from "@/lib/attachments/library-dto";
import type { AttachmentLibraryFolderRecord } from "@/lib/attachments/library-dto";
import {
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
} from "@/lib/attachments/folders";

export { MAX_FOLDER_DEPTH, MAX_FOLDER_NAME_LENGTH, normalizeFolderName };

type FolderRow = typeof attachmentLibraryFolders.$inferSelect;

type ValidationError = { error: string; status: number };

export async function listLibraryFoldersForOwner(
  ownerId: string
): Promise<AttachmentLibraryFolderRecord[]> {
  const rows = await db
    .select()
    .from(attachmentLibraryFolders)
    .where(eq(attachmentLibraryFolders.ownerId, ownerId))
    .orderBy(asc(attachmentLibraryFolders.name));
  return rows.map(toLibraryFolderDto);
}

export async function loadLibraryFolder(
  ownerId: string,
  folderId: string
): Promise<FolderRow | undefined> {
  const [folder] = await db
    .select()
    .from(attachmentLibraryFolders)
    .where(
      and(
        eq(attachmentLibraryFolders.id, folderId),
        eq(attachmentLibraryFolders.ownerId, ownerId)
      )
    );
  return folder;
}

export async function validateLibraryFolderPlacement({
  ownerId,
  parentId,
  folderId,
}: {
  ownerId: string;
  parentId: string | null;
  folderId: string | null;
}): Promise<ValidationError | null> {
  if (parentId === null) return null;
  if (parentId === folderId) {
    return { error: "A folder cannot be moved into itself", status: 400 };
  }

  const rows = await db
    .select({
      id: attachmentLibraryFolders.id,
      parentId: attachmentLibraryFolders.parentId,
    })
    .from(attachmentLibraryFolders)
    .where(eq(attachmentLibraryFolders.ownerId, ownerId));

  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  if (!parentById.has(parentId)) {
    return { error: "Parent folder not found", status: 404 };
  }

  let depth = 1;
  let cursor: string | null = parentId;
  while (cursor !== null) {
    if (cursor === folderId) {
      return {
        error: "A folder cannot be moved into its own subtree",
        status: 400,
      };
    }
    depth += 1;
    if (depth > MAX_FOLDER_DEPTH) {
      return {
        error: `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`,
        status: 400,
      };
    }
    cursor = parentById.get(cursor) ?? null;
  }

  return null;
}

export async function ensureLibraryFolderPath({
  ownerId,
  parentId,
  segments,
}: {
  ownerId: string;
  parentId: string | null;
  segments: string[];
}): Promise<
  | { ok: true; folderId: string | null }
  | { ok: false; error: string; status: number }
> {
  const names: string[] = [];
  for (const raw of segments) {
    const name = normalizeFolderName(raw);
    if (!name) {
      return { ok: false, error: "Invalid folder name in path", status: 400 };
    }
    names.push(name);
  }

  if (parentId !== null) {
    const parent = await loadLibraryFolder(ownerId, parentId);
    if (!parent) {
      return { ok: false, error: "Folder not found", status: 404 };
    }
  }

  if (names.length === 0) {
    return { ok: true, folderId: parentId };
  }

  const existing = await db
    .select()
    .from(attachmentLibraryFolders)
    .where(eq(attachmentLibraryFolders.ownerId, ownerId));

  let currentParent = parentId;
  for (const name of names) {
    const match = existing.find(
      (folder) => folder.parentId === currentParent && folder.name === name
    );
    if (match) {
      currentParent = match.id;
      continue;
    }

    const placementError = await validateLibraryFolderPlacement({
      ownerId,
      parentId: currentParent,
      folderId: null,
    });
    if (placementError) {
      return {
        ok: false,
        error: placementError.error,
        status: placementError.status,
      };
    }

    const [created] = await db
      .insert(attachmentLibraryFolders)
      .values({ ownerId, parentId: currentParent, name })
      .returning();
    if (!created) {
      return { ok: false, error: "Could not create folder", status: 500 };
    }
    existing.push(created);
    currentParent = created.id;
  }

  return { ok: true, folderId: currentParent };
}
