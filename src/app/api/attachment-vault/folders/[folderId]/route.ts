import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachmentLibraryFolders } from "@/db/schema";
import { archiveLibraryItems } from "@/lib/attachments/library-archive";
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
 * Archiving a library folder hides it and every nested folder and file.
 * Report links stay. Restore from the vault Archive section.
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
  const result = await archiveLibraryItems(user, {
    assetIds: [],
    folderIds: [folderId],
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true });
}
