import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachmentFolders } from "@/db/schema";
import { toAttachmentFolderDto } from "@/lib/attachments/dto";
import {
  listAttachmentFolders,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
  validateFolderPlacement,
} from "@/lib/attachments/folders";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(MAX_FOLDER_NAME_LENGTH),
  parentId: z.string().min(1).nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const folders = await listAttachmentFolders(reportId);
  return NextResponse.json({ folders });
}

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

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const name = normalizeFolderName(parsed.data.name);
  if (!name) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const parentId = parsed.data.parentId ?? null;
  const placementError = await validateFolderPlacement({
    reportId,
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
    .insert(reportAttachmentFolders)
    .values({ reportId, parentId, name, createdById: access.user.id })
    .returning();

  return NextResponse.json({ folder: toAttachmentFolderDto(folder) });
}
