import { LangfuseClient } from "@langfuse/client";
import {
  isLangfuseEnabled,
  clipLangfuseAttribute,
  getActiveTraceId,
} from "./langfuse";

/**
 * Daily ops scores for suggestion quality and user course-correction.
 *
 * Score names (filter these in Langfuse):
 * - `suggestion_decision` CATEGORICAL accepted|dismissed — sessionId = reportId
 * - `user_course_corrected` BOOLEAN 1 — chat trace when possible; else session
 * - `user_edited_after` BOOLEAN 1 — sessionId = reportId (section PATCH has no trace)
 *
 * TODO: Langfuse Prompt Manager (`promptName` / `promptVersion` on generations)
 * is not wired. In-app labels already exist (`CHAT_PROMPT_VERSION`,
 * `ANALYTICS_CHAT_PROMPT_VERSION`, `SUGGEST_PROMPT_VERSION`, eval
 * `promptVersion`). Linking those is a follow-up, not required for these scores.
 */

let langfuseClient: LangfuseClient | null = null;

function getLangfuseClient(): LangfuseClient | null {
  if (!isLangfuseEnabled()) {
    langfuseClient = null;
    return null;
  }
  if (langfuseClient) return langfuseClient;

  langfuseClient = new LangfuseClient({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });
  return langfuseClient;
}

export type SuggestionDecision = "accepted" | "dismissed";

export interface SuggestionDecisionScoreParams {
  /** The report ID, used as session ID to correlate with suggestion generation traces. */
  reportId: string;
  decision: SuggestionDecision;
  suggestionId: string;
  section?: string;
  contentPath?: string;
  reason?: string;
}

/**
 * Records a `suggestion_decision` score to Langfuse when a user accepts or
 * dismisses an AI suggestion.
 *
 * Score name: `suggestion_decision`
 * Data type: CATEGORICAL (values: "accepted", "dismissed")
 *
 * This score is attached to the session (using reportId as sessionId, matching
 * the suggestion generation traces) to enable correlation between suggestion
 * generation quality and user acceptance rates.
 *
 * Daily digest query: Filter scores by name="suggestion_decision" and group
 * by session to correlate with report-suggest-edits traces.
 */
export async function recordSuggestionDecisionScore(
  params: SuggestionDecisionScoreParams
): Promise<void> {
  const client = getLangfuseClient();
  if (!client) return;

  const comment = [
    `Suggestion ${params.decision}`,
    params.section ? `section: ${params.section}` : null,
    params.contentPath ? `field: ${params.contentPath}` : null,
    params.reason,
  ]
    .filter(Boolean)
    .join("; ");

  try {
    client.score.create({
      id: `suggestion-decision-${params.suggestionId}`,
      sessionId: params.reportId,
      name: "suggestion_decision",
      value: params.decision,
      dataType: "CATEGORICAL",
      comment: clipLangfuseAttribute(comment),
    });
    await client.flush();
  } catch (err) {
    console.error("langfuse: failed to record suggestion_decision score", err);
  }
}

export interface UserCourseCorrectScoreParams {
  traceId?: string;
  sessionId: string;
  reportId: string;
  reason: string;
  previousAssistantText?: string;
  userText?: string;
}

/**
 * Records a `user_course_corrected` score to Langfuse when a user's follow-up
 * clearly overrides or contradicts prior LLM output.
 *
 * Score name: `user_course_corrected`
 * Data type: BOOLEAN (1 = true)
 *
 * Detection is based on product signals (explicit intent classifier or clear
 * rewrite intents) rather than brittle keyword-only heuristics.
 *
 * Note: This score fires only when course correction is detected; absence of
 * this score does not imply the user was satisfied.
 */
export async function recordUserCourseCorrectScore(
  params: UserCourseCorrectScoreParams
): Promise<void> {
  const client = getLangfuseClient();
  if (!client) return;

  const traceId = params.traceId ?? getActiveTraceId() ?? undefined;
  if (!traceId && !params.sessionId) {
    console.warn("langfuse: no trace or session for user_course_corrected score");
    return;
  }

  const comment = [
    `Course correction detected: ${params.reason}`,
    params.reportId ? `report: ${params.reportId}` : null,
    params.previousAssistantText
      ? `previous: "${clipLangfuseAttribute(params.previousAssistantText.slice(0, 100))}"`
      : null,
    params.userText
      ? `user: "${clipLangfuseAttribute(params.userText.slice(0, 100))}"`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  try {
    client.score.create({
      ...(traceId ? { traceId } : {}),
      sessionId: params.sessionId,
      name: "user_course_corrected",
      value: 1,
      dataType: "BOOLEAN",
      comment: clipLangfuseAttribute(comment),
    });
    await client.flush();
  } catch (err) {
    console.error("langfuse: failed to record user_course_corrected score", err);
  }
}

export interface UserEditedAfterScoreParams {
  traceId?: string;
  sessionId?: string;
  reportId: string;
  sectionId: string;
  wasLlmGenerated: boolean;
  /** When the LLM last wrote this section — idempotency key so autosave does not spam scores. */
  llmAuthoredAt?: Date;
}

/**
 * Records a `user_edited_after` score to Langfuse when a user edits a section
 * that was previously authored or modified by the LLM.
 *
 * Score name: `user_edited_after`
 * Data type: BOOLEAN (1 = user edited LLM-generated content)
 *
 * This score helps track whether users are satisfied with LLM output or need
 * to make corrections.
 */
export async function recordUserEditedAfterScore(
  params: UserEditedAfterScoreParams
): Promise<void> {
  if (!params.wasLlmGenerated) return;

  const client = getLangfuseClient();
  if (!client) return;

  // Section PATCH is not a Langfuse observation. Attach to the report session
  // (same sessionId as report-suggest-edits) so daily ops can still join.
  const traceId = params.traceId ?? getActiveTraceId() ?? undefined;
  const sessionId = params.sessionId ?? params.reportId;
  const authoredAtMs = params.llmAuthoredAt?.getTime();
  const scoreId = `user-edited-after-${params.reportId}-${params.sectionId}-${authoredAtMs ?? "unknown"}`;
  const comment = [
    `User edited LLM-generated section: ${params.sectionId}`,
    "was_llm_generated: true",
  ].join("; ");

  try {
    client.score.create({
      id: scoreId,
      ...(traceId ? { traceId } : {}),
      sessionId,
      name: "user_edited_after",
      value: 1,
      dataType: "BOOLEAN",
      comment: clipLangfuseAttribute(comment),
    });
    await client.flush();
  } catch (err) {
    console.error("langfuse: failed to record user_edited_after score", err);
  }
}

/**
 * Flushes any pending Langfuse scores.
 * Call this at the end of request handlers to ensure scores are sent.
 */
export async function flushLangfuseScores(): Promise<void> {
  const client = getLangfuseClient();
  if (!client) return;
  try {
    await client.flush();
  } catch (err) {
    console.error("langfuse: failed to flush scores", err);
  }
}
