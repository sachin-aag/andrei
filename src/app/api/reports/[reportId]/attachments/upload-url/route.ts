import { NextResponse } from "next/server";
import {
  PDF_MIME_TYPE,
  validatePdfUploadInput,
} from "@/lib/attachments/pdf-upload";
import {
  newAttachmentId,
  requireReportAttachmentModify,
} from "@/lib/attachments/route-helpers";
import {
  buildAttachmentObjectKey,
  createResumableUploadUri,
} from "@/lib/storage/gcs";

export const runtime = "nodejs";

type UploadUrlBody = {
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const access = await requireReportAttachmentModify(reportId);
  if ("error" in access) return access.error;

  const body = (await req.json().catch(() => null)) as UploadUrlBody | null;
  if (!body?.filename || !body.mimeType || typeof body.sizeBytes !== "number") {
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

  try {
    const attachmentId = newAttachmentId();
    const objectKey = buildAttachmentObjectKey(
      reportId,
      attachmentId,
      body.filename
    );
    const uploadUrl = await createResumableUploadUri({
      objectKey,
      contentType: PDF_MIME_TYPE,
      sizeBytes: body.sizeBytes,
    });

    return NextResponse.json({ attachmentId, objectKey, uploadUrl });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
