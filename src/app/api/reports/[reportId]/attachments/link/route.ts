import { NextResponse } from "next/server";
import { z } from "zod";
import { validateFolderPlacement } from "@/lib/attachments/folders";
import { linkLibraryItemsToReport } from "@/lib/attachments/link-library-to-report";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetFolderId: z.string().min(1).nullable().optional(),
  assetIds: z.array(z.string().min(1)).optional(),
  libraryFolderIds: z.array(z.string().min(1)).optional(),
  excludedAssetIds: z.array(z.string().min(1)).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canMutateAttachments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const targetFolderId = parsed.data.targetFolderId ?? null;
  const placementError = await validateFolderPlacement({
    reportId,
    parentId: targetFolderId,
    folderId: null,
  });
  if (placementError) {
    return NextResponse.json(
      { error: placementError.error },
      { status: placementError.status }
    );
  }

  const result = await linkLibraryItemsToReport({
    reportId,
    user: access.user,
    targetFolderId,
    assetIds: parsed.data.assetIds,
    libraryFolderIds: parsed.data.libraryFolderIds,
    excludedAssetIds: parsed.data.excludedAssetIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    attachments: result.attachments,
    folders: result.folders,
  });
}
