import type { AuditAction, AuditEntity } from "@/db/schema";

/** Mirrors Postgres `audit_events_canonical_payload` for client-side verification. */
export function auditEventCanonicalPayload(input: {
  prevHash: string;
  actorId: string;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}): string {
  const oldText =
    input.oldValue === undefined || input.oldValue === null
      ? "null"
      : JSON.stringify(input.oldValue);
  const newText =
    input.newValue === undefined || input.newValue === null
      ? "null"
      : JSON.stringify(input.newValue);

  return [
    input.prevHash ?? "",
    input.actorId ?? "",
    input.action ?? "",
    input.entityType ?? "",
    input.entityId ?? "",
    oldText,
    newText,
    input.createdAt ?? "",
  ].join("|");
}
