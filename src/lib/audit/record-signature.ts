import { db } from "@/db";
import {
  electronicSignatures,
  type AuditAction,
  type SignatureMeaning,
} from "@/db/schema";
import type { AuditActorSnapshot } from "./actor";
import { recordAuditEvent } from "./record-audit-event";
import { checkpointAllSectionsForReport } from "./record-section-version";
import {
  assertAttachmentsReadyForSubmission,
  computeReportContentHash,
  computeReportVersionSeq,
} from "@/lib/reports/compute-content-hash";

const MEANING_TO_ACTION: Record<SignatureMeaning, AuditAction> = {
  submission: "signature_submission",
  approval: "signature_approval",
  rejection: "signature_rejection",
};

const MEANING_LABEL: Record<SignatureMeaning, string> = {
  submission: "Submitted for review",
  approval: "Approved investigation report",
  rejection: "Returned for feedback",
};

export type RecordSignatureInput = {
  actor: AuditActorSnapshot;
  reportId: string;
  meaning: SignatureMeaning;
};

export class SubmissionAttachmentsNotReadyError extends Error {
  constructor(
    message: string,
    readonly attachments: Array<{
      attachmentId: string;
      filename: string;
      processingStatus: string;
    }>
  ) {
    super(message);
    this.name = "SubmissionAttachmentsNotReadyError";
  }
}

export async function recordElectronicSignature(input: RecordSignatureInput) {
  if (input.meaning === "submission") {
    const attachmentCheck = await assertAttachmentsReadyForSubmission(input.reportId);
    if (!attachmentCheck.ok) {
      throw new SubmissionAttachmentsNotReadyError(
        attachmentCheck.message,
        attachmentCheck.attachments
      );
    }
  }

  await checkpointAllSectionsForReport(input.reportId);

  const [contentHash, signedVersionSeq] = await Promise.all([
    computeReportContentHash(input.reportId),
    computeReportVersionSeq(input.reportId),
  ]);

  const auditEvent = await recordAuditEvent({
    actor: input.actor,
    action: MEANING_TO_ACTION[input.meaning],
    entityType: "signature",
    entityId: input.reportId,
    reportId: input.reportId,
    summary: `${input.actor.name} — ${MEANING_LABEL[input.meaning]}`,
    newValue: {
      signerId: input.actor.id,
      signerName: input.actor.name,
      meaning: input.meaning,
      contentHash,
      signedVersionSeq,
    },
  });

  const [signature] = await db
    .insert(electronicSignatures)
    .values({
      reportId: input.reportId,
      signerId: input.actor.id,
      signerName: input.actor.name,
      meaning: input.meaning,
      authMethod: "password+user_id",
      contentHash,
      signedVersionSeq,
      auditEventId: auditEvent.id,
    })
    .returning();

  return { signature, auditEvent, contentHash, signedVersionSeq };
}

export async function listSignaturesForReport(reportId: string) {
  return db.query.electronicSignatures.findMany({
    where: (t, { eq }) => eq(t.reportId, reportId),
    orderBy: (t, { asc }) => [asc(t.signedAt)],
  });
}
