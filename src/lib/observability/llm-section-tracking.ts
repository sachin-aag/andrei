/**
 * Tracking LLM authorship of report sections for observability.
 *
 * Used to detect when a user edits a section that was previously authored
 * or modified by the LLM (via chat or applied suggestions).
 */

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  documentRevisions,
  documentRevisionSections,
  auditEvents,
} from "@/db/schema";

/**
 * Time window for considering a section "recently" LLM-authored.
 * If the LLM modified this section within this window, user edits are
 * considered "editing after LLM" and will fire the user_edited_after score.
 *
 * 24 hours is a reasonable window — longer than a typical editing session
 * but not so long that unrelated edits trigger the score.
 */
const LLM_AUTHORED_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface LlmSectionAuthorship {
  wasLlmAuthored: boolean;
  reason: "agent_turn" | "suggestion_applied" | "not_llm_authored";
  lastModifiedAt?: Date;
}

/**
 * Checks if a report section was recently authored or modified by the LLM.
 *
 * Returns `{ wasLlmAuthored: true }` if:
 * - The section was part of a recent `agent_turn` document revision, OR
 * - A suggestion was recently applied to this section
 *
 * @param reportId - The report ID
 * @param section - The section key (e.g., "define", "measure")
 * @param windowMs - Optional time window (defaults to 24 hours)
 */
export async function checkSectionLlmAuthorship(
  reportId: string,
  section: string,
  windowMs = LLM_AUTHORED_WINDOW_MS
): Promise<LlmSectionAuthorship> {
  const cutoff = new Date(Date.now() - windowMs);

  // Check for recent agent_turn revision that includes this section
  const recentAgentRevision = await db
    .select({
      createdAt: documentRevisions.createdAt,
    })
    .from(documentRevisions)
    .innerJoin(
      documentRevisionSections,
      eq(documentRevisionSections.revisionId, documentRevisions.id)
    )
    .where(
      and(
        eq(documentRevisions.reportId, reportId),
        eq(documentRevisions.source, "agent_turn"),
        eq(documentRevisionSections.section, section),
        gt(documentRevisions.createdAt, cutoff)
      )
    )
    .orderBy(desc(documentRevisions.createdAt))
    .limit(1);

  if (recentAgentRevision.length > 0) {
    return {
      wasLlmAuthored: true,
      reason: "agent_turn",
      lastModifiedAt: recentAgentRevision[0]!.createdAt,
    };
  }

  // Check for recent suggestion_applied audit event on this section
  // Using SQL to query the JSON field for section
  const recentSuggestionApplied = await db
    .select({
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.reportId, reportId),
        eq(auditEvents.action, "suggestion_applied"),
        gt(auditEvents.createdAt, cutoff),
        sql`${auditEvents.newValue}->>'section' = ${section}`
      )
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);

  if (recentSuggestionApplied.length > 0) {
    return {
      wasLlmAuthored: true,
      reason: "suggestion_applied",
      lastModifiedAt: recentSuggestionApplied[0]!.createdAt,
    };
  }

  return {
    wasLlmAuthored: false,
    reason: "not_llm_authored",
  };
}
