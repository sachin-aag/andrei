import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  electronicSignatures,
  type AuditAction,
  type AuditEntity,
} from "@/db/schema";

export type AuditEventFilters = {
  reportId?: string;
  actorId?: string;
  action?: AuditAction;
  entityType?: AuditEntity;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function listAuditEvents(filters: AuditEventFilters = {}) {
  const conditions: SQL[] = [];

  if (filters.reportId) {
    conditions.push(eq(auditEvents.reportId, filters.reportId));
  }
  if (filters.actorId) {
    conditions.push(eq(auditEvents.actorId, filters.actorId));
  }
  if (filters.action) {
    conditions.push(eq(auditEvents.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(auditEvents.entityType, filters.entityType));
  }
  if (filters.from) {
    conditions.push(gte(auditEvents.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(auditEvents.createdAt, filters.to));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.seq))
    .limit(filters.limit ?? 500);
}

export async function getAuditEventById(id: string) {
  const [row] = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.id, id))
    .limit(1);
  return row ?? null;
}

export async function listReportSignatures(reportId: string) {
  return db
    .select()
    .from(electronicSignatures)
    .where(eq(electronicSignatures.reportId, reportId))
    .orderBy(asc(electronicSignatures.signedAt));
}

export async function listGlobalAuditSummary(limit = 100) {
  return db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.seq))
    .limit(limit);
}
