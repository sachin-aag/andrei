import type { SectionType } from "@/db/schema";

/** Map legacy `narrative` ai_fix paths to the plain-text field the UI actually edits. */
export function resolveSuggestionFieldPath(
  section: SectionType,
  commentContentPath: string | null,
  fieldContentPath: string
): string {
  const path = commentContentPath ?? fieldContentPath;
  if (path === "narrative" && section === "improve" && fieldContentPath === "correctiveActions") {
    return "correctiveActions";
  }
  if (path === "narrative" && section === "control" && fieldContentPath === "preventiveActions") {
    return "preventiveActions";
  }
  return path;
}

/**
 * Plain-text field path used for locate/preview/apply. Maps legacy improve/control
 * `narrative` comments to the fields the UI actually edits.
 */
export function effectivePlainTextContentPath(
  section: SectionType,
  commentContentPath: string | null,
  fieldContentPath?: string
): string {
  if (fieldContentPath) {
    return resolveSuggestionFieldPath(
      section,
      commentContentPath,
      fieldContentPath
    );
  }
  const path = commentContentPath ?? "narrative";
  if (section === "improve" && path === "narrative") {
    return "correctiveActions";
  }
  if (section === "control" && path === "narrative") {
    return "preventiveActions";
  }
  return path;
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
  return `${section}.${path}`;
}
