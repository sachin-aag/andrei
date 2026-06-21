import { db } from "@/db";
import {
  electronicSignatures,
  type AuditAction,
  type SignatureMeaning,
} from "@/db/schema";
import type { AuditActorSnapshot } from "./actor";
import { recordAuditEvent } from "./record-audit-event";
import { checkpointAllSectionsForReport } from "./record-section-version";

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

export async function recordElectronicSignature(input: RecordSignatureInput) {
  await checkpointAllSectionsForReport(input.reportId);

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
    },
  });

  const [signature] = await db
    .insert(electronicSignatures)
    .values({
      reportId: input.reportId,
      signerId: input.actor.id,
      signerName: input.actor.name,
      meaning: input.meaning,
      authMethod: "password",
      auditEventId: auditEvent.id,
    })
    .returning();

  return { signature, auditEvent };
}

export async function listSignaturesForReport(reportId: string) {
  return db.query.electronicSignatures.findMany({
    where: (t, { eq }) => eq(t.reportId, reportId),
    orderBy: (t, { asc }) => [asc(t.signedAt)],
  });
}
