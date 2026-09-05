import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  attachmentAssets,
  attachmentLibraryFolders,
} from "@/db/schema";
import { toLibraryFolderDto } from "@/lib/attachments/library-dto";
import {
  loadLibraryFolder,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
  validateLibraryFolderPlacement,
} from "@/lib/attachments/library-folders";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(MAX_FOLDER_NAME_LENGTH).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { folderId } = await params;
  const folder = await loadLibraryFolder(user.id, folderId);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates: {
    name?: string;
    parentId?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (parsed.data.name !== undefined) {
    const name = normalizeFolderName(parsed.data.name);
    if (!name) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }
    updates.name = name;
  }

  if (parsed.data.parentId !== undefined) {
    const placementError = await validateLibraryFolderPlacement({
      ownerId: user.id,
      parentId: parsed.data.parentId,
      folderId,
    });
    if (placementError) {
      return NextResponse.json(
        { error: placementError.error },
        { status: placementError.status }
      );
    }
    updates.parentId = parsed.data.parentId;
  }

  const [updated] = await db
    .update(attachmentLibraryFolders)
    .set(updates)
    .where(
      and(
        eq(attachmentLibraryFolders.id, folderId),
        eq(attachmentLibraryFolders.ownerId, user.id)
      )
    )
    .returning();

  return NextResponse.json({ folder: toLibraryFolderDto(updated) });
}

/**
 * Deleting a library folder reparents child folders and moves assets to the
 * deleted folder's parent. Nothing is removed from reports.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { folderId } = await params;
  const folder = await loadLibraryFolder(user.id, folderId);
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(attachmentLibraryFolders)
      .set({ parentId: folder.parentId, updatedAt: new Date() })
      .where(
        and(
          eq(attachmentLibraryFolders.ownerId, user.id),
          eq(attachmentLibraryFolders.parentId, folderId)
        )
      );
    await tx
      .update(attachmentAssets)
      .set({ libraryFolderId: folder.parentId })
      .where(
        and(
          eq(attachmentAssets.ownerId, user.id),
          eq(attachmentAssets.libraryFolderId, folderId)
        )
      );
    await tx
      .delete(attachmentLibraryFolders)
      .where(
        and(
          eq(attachmentLibraryFolders.id, folderId),
          eq(attachmentLibraryFolders.ownerId, user.id)
        )
      );
  });

  return NextResponse.json({ ok: true });
}
