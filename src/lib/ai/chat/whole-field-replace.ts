/**
 * Whether the engineer asked to replace a whole field — not a local tweak.
 *
 * `replaceFilledField` is model-controlled. This is the server-side check that
 * the latest user turn actually requested a full rewrite, so "remove the
 * versioning details in Purpose" cannot redraft the field.
 */

/** Removals and trims stay on propose_edit even when they name a section. */
const LOCAL_EDIT_RE =
  /\b(?:remove|delete|drop|strip|omit|cut|take out|cross out|without)\b/i;

/** Local spans — rewrite/replace of these is still targeted. */
const LOCAL_SPAN_RE =
  /\b(?:sentence|paragraph|passage|wording|line|clause|phrase|detail|details|word|words|typo|typos|version|versions|versioning)\b/i;

const WHOLE_FIELD_REPLACE_RE =
  /\b(?:start over|from scratch|full(?:y)?\s+(?:re-?write|replace)|redraft)\b|\b(?:re-?write|replace)\b.{0,80}\b(?:the\s+)?(?:whole|entire|full)\b.{0,40}\b(?:section|field|narrative)?|\b(?:re-?write|replace|redraft)\s+(?:the\s+)?(?:this\s+)?(?:\w+\s+){0,4}(?:section|field|narrative)\b|\b(?:re-?write|replace)\s+(?:the\s+)?(?:purpose|define|measure|analyze|improve|control|conclusion)\b/i;

export function askedToReplaceWholeField(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const namesWholeField = WHOLE_FIELD_REPLACE_RE.test(trimmed);
  const namesLocalSpan = LOCAL_SPAN_RE.test(trimmed);
  const namesLocalEdit = LOCAL_EDIT_RE.test(trimmed);
  const namesWholeQualifier = /\b(?:whole|entire|full)\s+(?:section|field|narrative)\b/i.test(
    trimmed
  );

  // "rewrite the first paragraph" / "replace the version numbers"
  if (namesLocalSpan && !namesWholeQualifier) return false;
  // "remove the versioning details in the purpose section"
  if (namesLocalEdit && !namesWholeField) return false;
  return namesWholeField;
}
