import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { attachmentAccessGrants } from "@/db/schema";
import {
  canManageAttachmentAsset,
  loadAccessibleAsset,
} from "@/lib/attachments/library-access";
import { toAccessGrantDto } from "@/lib/attachments/library-dto";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const patchSchema = z.object({
  granteeUserIds: z.array(z.string().min(1)).max(200),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const asset = await loadAccessibleAsset(user, assetId);
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageAttachmentAsset(user, asset)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const grants = await db
    .select()
    .from(attachmentAccessGrants)
    .where(eq(attachmentAccessGrants.assetId, assetId));

  return NextResponse.json({
    grants: grants.map(toAccessGrantDto),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const asset = await loadAccessibleAsset(user, assetId);
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageAttachmentAsset(user, asset)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const granteeUserIds = [
    ...new Set(
      parsed.data.granteeUserIds.filter((id) => id !== asset.ownerId)
    ),
  ];

  await db.transaction(async (tx) => {
    await tx
      .delete(attachmentAccessGrants)
      .where(eq(attachmentAccessGrants.assetId, assetId));

    if (granteeUserIds.length > 0) {
      await tx.insert(attachmentAccessGrants).values(
        granteeUserIds.map((granteeUserId) => ({
          id: createId(),
          assetId,
          granteeUserId,
          grantedById: user.id,
        }))
      );
    }
  });

  const grants = await db
    .select()
    .from(attachmentAccessGrants)
    .where(eq(attachmentAccessGrants.assetId, assetId));

  return NextResponse.json({
    grants: grants.map(toAccessGrantDto),
  });
}
