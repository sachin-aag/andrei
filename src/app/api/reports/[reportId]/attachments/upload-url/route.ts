import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import {
  getAttachmentStorage,
  permanentObjectKey,
  stagingObjectKey,
} from "@/lib/storage/attachments";

export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
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

  const activeRows = await db
    .select({
      sizeBytes: reportAttachments.sizeBytes,
    })
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );
  const activeSizeBytes = activeRows.reduce((sum, row) => sum + row.sizeBytes, 0);
  if (activeRows.length >= limits.maxAttachmentsPerReport) {
    return NextResponse.json(
      { error: `Report already has ${limits.maxAttachmentsPerReport} attachments` },
      { status: 400 }
    );
  }
  if (activeSizeBytes + sizeBytes > limits.maxAttachmentBytesPerReport) {
    return NextResponse.json(
      { error: "Report attachment storage limit exceeded" },
      { status: 400 }
    );
  }

  const attachmentId = createId();
  const stagingKey = stagingObjectKey(attachmentId);
  const permanentKey = permanentObjectKey(reportId, attachmentId);

  await db.insert(reportAttachments).values({
    id: attachmentId,
    reportId,
    filename,
    mimeType,
    sizeBytes,
    sha256: "",
    stagingObjectKey: stagingKey,
    permanentObjectKey: permanentKey,
    processingStatus: "uploading",
    processingProgress: 0,
    uploadedById: access.user.id,
  });

  const uploadUrl = await getAttachmentStorage().createResumableUpload({
    objectKey: stagingKey,
    contentType: mimeType,
    sizeBytes,
  });

  return NextResponse.json({ attachmentId, uploadUrl });
}
