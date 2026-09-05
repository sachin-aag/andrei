import { NextResponse } from "next/server";
import { z } from "zod";
import { archiveLibraryItems } from "@/lib/attachments/library-archive";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  assetIds: z.array(z.string().min(1)).optional(),
  folderIds: z.array(z.string().min(1)).optional(),
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

  const result = await archiveLibraryItems(user, {
    assetIds: parsed.data.assetIds ?? [],
    folderIds: parsed.data.folderIds ?? [],
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    archivedAssets: result.archivedAssets,
    archivedFolders: result.archivedFolders,
  });
}
