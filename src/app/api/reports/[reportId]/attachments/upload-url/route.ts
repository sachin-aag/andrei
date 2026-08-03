import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { validateFolderPlacement } from "@/lib/attachments/folders";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import { reserveAttachmentUpload } from "@/lib/attachments/reserve-upload";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  folderId: z.string().min(1).nullable().optional(),
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

  const { filename, mimeType, sizeBytes } = parsed.data;
  const folderId = parsed.data.folderId ?? null;
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }
  if (mimeType !== "application/pdf") {
    return NextResponse.json(
      { error: "PDF MIME type must be application/pdf" },
      { status: 400 }
    );
  }

  const limits = getAttachmentLimits();
  if (sizeBytes > limits.maxAttachmentBytes) {
    return NextResponse.json(
      { error: `PDF exceeds ${limits.maxAttachmentBytes} byte limit` },
      { status: 400 }
    );
  }

  const placementError = await validateFolderPlacement({
    reportId,
    parentId: folderId,
    folderId: null,
  });
  if (placementError) {
    return NextResponse.json(
      { error: placementError.error },
      { status: placementError.status }
    );
  }

  const reserved = await reserveAttachmentUpload({
    reportId,
    folderId,
    filename,
    mimeType,
    sizeBytes,
    uploadedById: access.user.id,
  });
  if (!reserved.ok) {
    return NextResponse.json(
      { error: reserved.error },
      { status: reserved.status }
    );
  }

  try {
    const uploadUrl = await getAttachmentStorage().createResumableUpload({
      objectKey: reserved.stagingObjectKey,
      contentType: mimeType,
      sizeBytes,
      origin: browserOriginFromRequest(req),
    });
    return NextResponse.json({
      attachmentId: reserved.attachmentId,
      uploadUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create upload URL";
    await db
      .update(reportAttachments)
      .set({
        processingStatus: "failed",
        processingProgress: 0,
        processingError: message,
      })
      .where(eq(reportAttachments.id, reserved.attachmentId));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Origin the browser will send on PUT — must match the resumable session. */
function browserOriginFromRequest(req: Request): string | null {
  const origin = req.headers.get("origin")?.trim();
  if (origin) return origin;

  const referer = req.headers.get("referer")?.trim();
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
