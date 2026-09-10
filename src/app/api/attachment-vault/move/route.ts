import { NextResponse } from "next/server";
import { z } from "zod";
import { moveLibraryItems } from "@/lib/attachments/library-manage";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  assetIds: z.array(z.string().min(1)).optional(),
  folderIds: z.array(z.string().min(1)).optional(),
  targetFolderId: z.string().min(1).nullable(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await moveLibraryItems(user, {
    assetIds: parsed.data.assetIds ?? [],
    folderIds: parsed.data.folderIds ?? [],
    targetFolderId: parsed.data.targetFolderId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    movedAssets: result.movedAssets,
    movedFolders: result.movedFolders,
  });
}
