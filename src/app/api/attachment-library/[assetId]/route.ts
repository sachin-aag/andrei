import { NextResponse } from "next/server";
import { z } from "zod";
import {
  moveLibraryAsset,
  softDeleteLibraryAsset,
} from "@/lib/attachments/library-manage";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const patchSchema = z.object({
  libraryFolderId: z.string().min(1).nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await moveLibraryAsset(
    user,
    assetId,
    parsed.data.libraryFolderId
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ asset: result.asset });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const result = await softDeleteLibraryAsset(user, assetId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true });
}
