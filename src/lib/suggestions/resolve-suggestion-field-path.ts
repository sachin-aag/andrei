import type { SectionType } from "@/db/schema";

/**
 * Measure fields that legacy rows stored separately. `mergeMeasureSection` folds
 * their content into the narrative, so suggestions written against them (either
 * before the collapse or from a stale client) must follow it there.
 */
const LEGACY_MEASURE_FIELDS = new Set([
  "experimentNumber",
  "experimentTitle",
  "purpose",
  "conclusion",
]);

/**
 * The one field a suggestion targets, mapping legacy content paths onto the
 * field the UI actually edits. Field-independent by design: preview, apply and
 * gutter placement all resolve the same single target for a given comment.
 */
export function resolveSuggestionFieldPath(
  section: SectionType,
  commentContentPath: string | null,
  fieldContentPath: string
): string {
  const path = commentContentPath ?? fieldContentPath;
  if (path === "narrative" && section === "improve") return "correctiveActions";
  if (path === "narrative" && section === "control") return "preventiveActions";
  if (section === "measure" && LEGACY_MEASURE_FIELDS.has(path)) return "narrative";
  return path;
}

/** Plain-text field path used for locate/preview/apply. */
export function effectivePlainTextContentPath(
  section: SectionType,
  commentContentPath: string | null,
  fieldContentPath?: string
): string {
  return resolveSuggestionFieldPath(
    section,
    commentContentPath,
    fieldContentPath ?? "narrative"
  );
}

/**
 * Whether a comment belongs to the field rendering it. Guards previews so a
 * suggestion is only painted in the box it will actually be applied to.
 */
export function suggestionTargetsField(
  section: SectionType,
  commentContentPath: string | null,
  fieldContentPath: string
): boolean {
  // `?? "narrative"` mirrors how apply defaults a pathless comment.
  return (
    effectivePlainTextContentPath(section, commentContentPath) === fieldContentPath
  );
}

/** `data-field-anchor` value for gutter positioning of an ai_fix comment. */
export function suggestionFieldAnchorKey(
  section: SectionType,
  commentContentPath: string | null
): string {
  const path = commentContentPath ?? "narrative";
  if (section === "improve" && (path === "narrative" || path === "correctiveActions")) {
    return "improve.correctiveActions";
  }
  if (section === "control" && (path === "narrative" || path === "preventiveActions")) {
    return "control.preventiveActions";
  }
  return `${section}.${resolveSuggestionFieldPath(section, path, path)}`;
}
