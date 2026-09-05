import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attachmentLibraryFolders } from "@/db/schema";
import { toLibraryFolderDto } from "@/lib/attachments/library-dto";
import {
  listLibraryFoldersForOwner,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
  validateLibraryFolderPlacement,
} from "@/lib/attachments/library-folders";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(MAX_FOLDER_NAME_LENGTH),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const name = normalizeFolderName(parsed.data.name);
  if (!name) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const parentId = parsed.data.parentId ?? null;
  const placementError = await validateLibraryFolderPlacement({
    ownerId: user.id,
    parentId,
    folderId: null,
  });
  if (placementError) {
    return NextResponse.json(
      { error: placementError.error },
      { status: placementError.status }
    );
  }

  const [folder] = await db
    .insert(attachmentLibraryFolders)
    .values({ ownerId: user.id, parentId, name })
    .returning();

  return NextResponse.json({ folder: toLibraryFolderDto(folder) });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folders = await listLibraryFoldersForOwner(user.id);
  return NextResponse.json({ folders });
}
