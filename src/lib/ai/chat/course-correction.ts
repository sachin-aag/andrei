/**
 * Course correction detection for Document and Analytics chat.
 *
 * Detects when a user's follow-up message clearly overrides, contradicts, or
 * corrects prior LLM output. This is used to record a `user_course_corrected`
 * Langfuse score for daily quality monitoring.
 *
 * Detection is based on product signals (explicit rewrite/undo patterns, clear
 * contradictions) rather than brittle keyword-only heuristics. When detection
 * is uncertain, we do NOT fire the score (prefer false negatives over false
 * positives — the user may just be clarifying rather than correcting).
 */

export type CourseCorrection = {
  detected: boolean;
  reason: string;
  confidence: "high" | "medium";
};

/**
 * Explicit undo/revert patterns. These are high-confidence signals that the
 * user wants to reverse what the LLM just did.
 */
const UNDO_RE =
  /\b(?:undo|undo that|revert|go back|roll back|rollback|take that back|cancel that|never mind|nevermind)\b/i;

/**
 * Explicit correction patterns where the user is telling the LLM it was wrong.
 */
const WRONG_RE =
  /\b(?:that'?s (?:wrong|incorrect|not right|not what)|no,?\s+(?:i said|i asked|i meant|i wanted|that'?s not)|you (?:got it wrong|misunderstood|missed|forgot)|wrong|incorrect|not correct|that'?s not it)\b/i;

/**
 * Explicit override patterns where the user is changing direction mid-stream.
 * These require context from the prior assistant turn to confirm.
 */
const OVERRIDE_RE =
  /\b(?:actually|instead|rather|on second thought|forget (?:that|what i said)|scratch that|disregard|change (?:that|it) to|don'?t do that|stop|hold on)\b/i;

/**
 * Negation of prior output. User explicitly rejects what was proposed.
 */
const REJECT_RE =
  /\b(?:don'?t (?:use|include|add|put|write|draft)|remove (?:that|this|it)|delete (?:that|this|it)|get rid of|leave out|skip (?:that|this)|no (?:that|this)|i don'?t (?:want|need|like))\b/i;

/**
 * Rewrite request patterns. User asks to redo what the LLM just did.
 */
const REWRITE_RE =
  /\b(?:rewrite|redo|do (?:it|that) again|try again|start over|from scratch|completely different|not like that|differently)\b/i;

export interface DetectCourseCorrectionInput {
  userText: string;
  recentAssistantTexts?: readonly string[];
  /** Only fire when there's prior assistant output to correct. */
  hasPriorAssistantOutput?: boolean;
}

/**
 * Detects course correction patterns in the user's message.
 *
 * Returns `{ detected: true }` only when there's a high or medium confidence
 * signal that the user is correcting the LLM. Returns `{ detected: false }`
 * for ambiguous cases — we prefer false negatives to avoid noisy scores.
 *
 * @example
 * detectCourseCorrection({ userText: "undo that", hasPriorAssistantOutput: true })
 * // => { detected: true, reason: "undo_revert", confidence: "high" }
 *
 * detectCourseCorrection({ userText: "that's wrong, I wanted X not Y", hasPriorAssistantOutput: true })
 * // => { detected: true, reason: "explicit_wrong", confidence: "high" }
 *
 * detectCourseCorrection({ userText: "can you clarify?", hasPriorAssistantOutput: true })
 * // => { detected: false, reason: "no_correction_signal" }
 */
export function detectCourseCorrection(
  input: DetectCourseCorrectionInput
): CourseCorrection {
  const text = input.userText.trim();
  if (!text) {
    return { detected: false, reason: "empty_message", confidence: "medium" };
  }

  if (!input.hasPriorAssistantOutput) {
    return { detected: false, reason: "no_prior_output", confidence: "medium" };
  }

  if (UNDO_RE.test(text)) {
    return { detected: true, reason: "undo_revert", confidence: "high" };
  }

  if (WRONG_RE.test(text)) {
    return { detected: true, reason: "explicit_wrong", confidence: "high" };
  }

  if (REWRITE_RE.test(text)) {
    return { detected: true, reason: "rewrite_request", confidence: "high" };
  }

  if (OVERRIDE_RE.test(text) && text.length > 20) {
    return { detected: true, reason: "override_pattern", confidence: "medium" };
  }

  if (REJECT_RE.test(text)) {
    return { detected: true, reason: "reject_output", confidence: "medium" };
  }

  return { detected: false, reason: "no_correction_signal", confidence: "medium" };
}
