import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { canReprocessAttachment } from "@/lib/attachments/ingest-errors";
import { resolveAttachmentFields } from "@/lib/attachments/resolve-attachment";
import {
  closeOpenIngestRuns,
  startDocumentIngest,
} from "@/lib/attachments/start-ingest";
import {
  loadAssetForAttachment,
  patchLinkedProcessing,
} from "@/lib/attachments/sync-asset-processing";
import {
  AttachmentPageBudgetExceededError,
  attachmentPageBudgetExceededResponse,
} from "@/lib/attachments/page-budget";
import { reclaimStaleIngests } from "@/lib/attachments/stale-ingest";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, attachmentId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canMutateAttachments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // An ingest that died without writing a terminal status still reads as
  // `processing`; retire it first so the retry is not rejected.
  await reclaimStaleIngests(reportId);

  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await loadAssetForAttachment(attachment);
  const resolved = resolveAttachmentFields(attachment, asset);
  if (!canReprocessAttachment(resolved)) {
    return NextResponse.json(
      { error: "Only failed or incompletely indexed attachments can be reprocessed" },
      { status: 400 }
    );
  }
  if (!resolved.gcsGeneration) {
    return NextResponse.json(
      { error: "Attachment has no finalized source document" },
      { status: 400 }
    );
  }

  await closeOpenIngestRuns(
    attachmentId,
    attachment.assetId,
    "Reprocess requested"
  );
  await patchLinkedProcessing(attachmentId, attachment.assetId, {
    processingStatus: "queued",
    processingProgress: 0,
    processingPage: null,
    processingError: null,
  });

  try {
    await startDocumentIngest(attachmentId, resolved.gcsGeneration);
  } catch (error) {
    if (error instanceof AttachmentPageBudgetExceededError) {
      return attachmentPageBudgetExceededResponse(error);
    }
    throw error;
  }

  await recordAuditEvent({
    actor: auditActorFromUser(access.user),
    action: "attachment_reprocessed",
    entityType: "attachment",
    entityId: attachmentId,
    reportId,
    summary: `Attachment reprocessed: ${attachment.filename}`,
    newValue: {
      generation: resolved.gcsGeneration,
      previousStatus: resolved.processingStatus,
    },
  });

  const [current] = await db
    .select()
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId));
  return NextResponse.json({
    attachment: toAttachmentDto(current ?? attachment),
  });
}
