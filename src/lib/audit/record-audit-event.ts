import { db } from "@/db";
import { auditEvents, type AuditAction, type AuditEntity } from "@/db/schema";
import type { AuditActorSnapshot } from "./actor";

type DbInsertExecutor = Pick<typeof db, "insert">;

export type RecordAuditEventInput = {
  actor: AuditActorSnapshot;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  summary: string;
  reportId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  /** Use the caller's transaction so serverless pools (max 1) do not deadlock. */
  executor?: DbInsertExecutor;
};

export async function recordAuditEvent(input: RecordAuditEventInput) {
  const executor = input.executor ?? db;
  const [row] = await executor
    .insert(auditEvents)
    .values({
      reportId: input.reportId ?? null,
      actorId: input.actor.id,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      oldValue:
        input.oldValue === undefined
          ? null
          : (input.oldValue as Record<string, unknown>),
      newValue:
        input.newValue === undefined
          ? null
          : (input.newValue as Record<string, unknown>),
      metadata: input.metadata ?? {},
    })
    .returning();

  return row;
}
