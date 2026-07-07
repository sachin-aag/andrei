import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { validatePdfUploadInput } from "@/lib/attachments/pdf-upload";
import {
  requireReportAttachmentAccess,
  requireReportAttachmentModify,
} from "@/lib/attachments/route-helpers";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getObjectMetadata, objectExists } from "@/lib/storage/gcs";

export const runtime = "nodejs";

type FinalizeBody = {
  attachmentId?: string;
  objectKey?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const access = await requireReportAttachmentModify(reportId);
  if ("error" in access) return access.error;

  const body = (await req.json().catch(() => null)) as FinalizeBody | null;
  if (
    !body?.attachmentId ||
    !body.objectKey ||
    !body.filename ||
    !body.mimeType ||
    typeof body.sizeBytes !== "number"
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const validationError = validatePdfUploadInput({
    filename: body.filename,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const expectedPrefix = `reports/${reportId}/attachments/${body.attachmentId}/`;
  if (!body.objectKey.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "Invalid object key" }, { status: 400 });
  }

  try {
    const exists = await objectExists(body.objectKey);
    if (!exists) {
      return NextResponse.json(
        { error: "Uploaded file not found in storage" },
        { status: 400 }
      );
    }

    const metadata = await getObjectMetadata(body.objectKey);
    if (metadata.sizeBytes !== body.sizeBytes) {
      return NextResponse.json(
        { error: "Uploaded file size mismatch" },
        { status: 400 }
      );
    }

    const [row] = await db
      .insert(reportAttachments)
      .values({
        id: body.attachmentId,
        reportId,
        filename: body.filename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        sha256: body.sha256 ?? "",
        gcsObjectKey: body.objectKey,
        uploadedById: access.user.id,
      })
      .returning();

    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "attachment_uploaded",
      entityType: "attachment",
      entityId: row.id,
      reportId,
      summary: `Uploaded attachment ${row.filename}`,
      newValue: {
        id: row.id,
        filename: row.filename,
        sizeBytes: row.sizeBytes,
      },
    });

    return NextResponse.json({ attachment: row });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to finalize attachment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const access = await requireReportAttachmentAccess(reportId);
  if ("error" in access) return access.error;

  const rows = await db
    .select()
    .from(reportAttachments)
    .where(eq(reportAttachments.reportId, reportId));

  return NextResponse.json({ attachments: rows });
}
