/**
 * Persist and read report-level stated facts. Capture runs when a document
 * chat user message is saved. Failure here must not fail the turn.
 * Analytics chat does not call this.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportStatedFacts, workspaceUsers } from "@/db/schema";
import type { AuditActorSnapshot } from "@/lib/audit/actor";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { alreadyStatedHaystack } from "@/lib/ai/chat/citation-exemption";
import {
  englishTextForStatedFacts,
  extractStatedFactCandidates,
  normalizeStatement,
  omitStatedFactsAlreadyInReport,
  type StatedFactCandidate,
  type StatedFactRef,
} from "@/lib/ai/chat/stated-facts";
import { translateStatedFactToEnglish } from "@/lib/ai/chat/stated-fact-translate";

export type StatedFactView = StatedFactRef & {
  id: string;
  sourceText: string;
  authorName: string;
  createdAt: string;
};

export async function captureStatedFacts(input: {
  reportId: string;
  messageId: string;
  authorId: string;
  text: string;
  sections?: Partial<Record<string, unknown>> | null;
  reportMetadata?: Record<string, unknown> | null;
  actor: AuditActorSnapshot;
  translate?: (text: string) => Promise<string | null>;
}): Promise<void> {
  const prepared = await englishTextForStatedFacts(
    input.text,
    input.translate ??
      ((text) =>
        translateStatedFactToEnglish({
          text,
          reportId: input.reportId,
          userId: input.authorId,
        }))
  );
  if (!prepared) return;
  const haystack = haystackForSkip(input.sections, input.reportMetadata);
  const candidates = omitStatedFactsAlreadyInReport(
    extractStatedFactCandidates(prepared.english).map((candidate) =>
      prepared.original
        ? { ...candidate, sourceText: clipOriginal(prepared.original) }
        : candidate
    ),
    haystack
  );
  for (const candidate of candidates) {
    await insertStatedFact({
      reportId: input.reportId,
      messageId: input.messageId,
      authorId: input.authorId,
      actor: input.actor,
      candidate,
    });
  }
}

function clipOriginal(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function haystackForSkip(
  sections: Partial<Record<string, unknown>> | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): string {
  const parts = [alreadyStatedHaystack({ sections })];
  if (metadata && typeof metadata === "object") {
    for (const value of Object.values(metadata)) {
      if (typeof value === "string" && value.trim()) parts.push(value.trim());
    }
  }
  return parts.join("\n");
}

async function insertStatedFact(input: {
  reportId: string;
  messageId: string;
  authorId: string;
  actor: AuditActorSnapshot;
  candidate: StatedFactCandidate;
}): Promise<void> {
  const { candidate } = input;
  const existing = await db
    .select({ id: reportStatedFacts.id })
    .from(reportStatedFacts)
    .where(
      and(
        eq(reportStatedFacts.reportId, input.reportId),
        eq(reportStatedFacts.entityNormalized, ""),
        eq(reportStatedFacts.valueNormalized, candidate.normalized),
        isNull(reportStatedFacts.deletedAt)
      )
    )
    .limit(1);
  if (existing.length > 0) return;

  let id: string;
  try {
    const [row] = await db
      .insert(reportStatedFacts)
      .values({
        reportId: input.reportId,
        entityText: "",
        entityNormalized: "",
        valueText: candidate.text,
        valueKind: "statement",
        valueNormalized: candidate.normalized,
        sourceText: candidate.sourceText,
        sourceMessageId: input.messageId,
        createdBy: input.authorId,
      })
      .returning({ id: reportStatedFacts.id });
    if (!row) return;
    id = row.id;
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }

  await recordAuditEvent({
    actor: input.actor,
    action: "stated_fact_added",
    entityType: "stated_fact",
    entityId: id,
    reportId: input.reportId,
    summary: statedFactSummary("Recorded", candidate.text),
    newValue: { text: candidate.text },
  });
}

export async function listLiveStatedFacts(
  reportId: string
): Promise<StatedFactRef[]> {
  const rows = await db
    .select({
      valueText: reportStatedFacts.valueText,
      valueKind: reportStatedFacts.valueKind,
      valueNormalized: reportStatedFacts.valueNormalized,
      sourceText: reportStatedFacts.sourceText,
      entityText: reportStatedFacts.entityText,
    })
    .from(reportStatedFacts)
    .where(
      and(
        eq(reportStatedFacts.reportId, reportId),
        isNull(reportStatedFacts.deletedAt)
      )
    )
    .orderBy(asc(reportStatedFacts.createdAt));
  return rows.flatMap((row) => {
    const ref = refFromRow(row);
    return ref ? [ref] : [];
  });
}

export async function listStatedFactsForView(
  reportId: string
): Promise<StatedFactView[]> {
  const rows = await db
    .select({
      id: reportStatedFacts.id,
      entityText: reportStatedFacts.entityText,
      entityNormalized: reportStatedFacts.entityNormalized,
      valueText: reportStatedFacts.valueText,
      valueKind: reportStatedFacts.valueKind,
      valueNormalized: reportStatedFacts.valueNormalized,
      sourceText: reportStatedFacts.sourceText,
      createdAt: reportStatedFacts.createdAt,
      authorName: workspaceUsers.name,
    })
    .from(reportStatedFacts)
    .leftJoin(workspaceUsers, eq(workspaceUsers.id, reportStatedFacts.createdBy))
    .where(
      and(
        eq(reportStatedFacts.reportId, reportId),
        isNull(reportStatedFacts.deletedAt)
      )
    )
    .orderBy(asc(reportStatedFacts.createdAt));
  return rows.flatMap((row) => {
    const ref = refFromRow(row);
    if (!ref) return [];
    return [
      {
        ...ref,
        id: row.id,
        sourceText: row.sourceText,
        authorName: row.authorName?.trim() || "Former user",
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
}

function refFromRow(row: {
  valueText: string;
  valueKind: string;
  valueNormalized: string;
  sourceText: string;
  entityText: string;
}): StatedFactRef | null {
  const text = (
    row.valueKind === "statement"
      ? row.valueText
      : row.sourceText ||
        (row.entityText ? `${row.entityText}: ${row.valueText}` : row.valueText)
  ).trim();
  if (!text) return null;
  return {
    text,
    normalized:
      row.valueKind === "statement" && row.valueNormalized
        ? row.valueNormalized
        : normalizeStatement(text),
  };
}

export async function softDeleteStatedFact(input: {
  reportId: string;
  factId: string;
  actor: AuditActorSnapshot;
}): Promise<boolean> {
  const [existing] = await db
    .select({
      id: reportStatedFacts.id,
      valueText: reportStatedFacts.valueText,
      sourceText: reportStatedFacts.sourceText,
    })
    .from(reportStatedFacts)
    .where(
      and(
        eq(reportStatedFacts.id, input.factId),
        eq(reportStatedFacts.reportId, input.reportId),
        isNull(reportStatedFacts.deletedAt)
      )
    )
    .limit(1);
  if (!existing) return false;

  await db
    .update(reportStatedFacts)
    .set({ deletedAt: new Date(), deletedBy: input.actor.id })
    .where(eq(reportStatedFacts.id, existing.id));

  await recordAuditEvent({
    actor: input.actor,
    action: "stated_fact_deleted",
    entityType: "stated_fact",
    entityId: existing.id,
    reportId: input.reportId,
    summary: statedFactSummary("Removed", existing.sourceText || existing.valueText),
    oldValue: { text: existing.sourceText || existing.valueText },
  });
  return true;
}

function statedFactSummary(verb: string, text: string): string {
  const sentence = text.replace(/\s+/g, " ").trim().slice(0, 80);
  return `${verb} stated fact ${sentence}`;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: { code?: string } }).cause;
  return cause?.code === "23505";
}
