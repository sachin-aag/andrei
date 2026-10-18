import {
  isAiSuggestionKind,
  parseAiFixCommentContent,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import {
  canGenerateReviewSuggestion,
  commentReleasedToQueue,
  proposedEditFromMetadata,
} from "./proposed-edit";
import type { ReviewLocateTarget } from "./locate";
import type { ReviewCheckDto, ReviewFindingDto } from "./ui";

export type {
  ReviewLocateHighlight,
  ReviewLocateTarget,
} from "./locate";

/** What the suggestion box on every card says. */
export type ReviewCardSuggestion =
  | { kind: "replacement"; deleteText: string; insertText: string }
  | { kind: "draft_on_apply"; suggestedText: string | null }
  | { kind: "multi_part" }
  | { kind: "none" };

/** The one main button on every card. "none" shows it disabled with the reason. */
export type ReviewCardPrimaryAction = "apply" | "view" | "none";

export type ReviewFindingCardModel = {
  location: string;
  kicker: string | null;
  title: string;
  body: string;
  suggestion: ReviewCardSuggestion;
  primary: ReviewCardPrimaryAction;
  /** Null only when the finding is not tied to a section. */
  locate: ReviewLocateTarget | null;
};

type CardComment = {
  id: string;
  status: string;
  kind: string;
  content: string;
  anchorText: string;
  contentPath: string | null;
  evaluationId?: string | null;
};

function splitTitleBody(
  message: string,
  criterionLabel: string | null
): { title: string; body: string } {
  const trimmed = message.trim();
  if (criterionLabel) {
    const prefix = `${criterionLabel}:`;
    if (trimmed.startsWith(prefix)) {
      return {
        title: criterionLabel,
        body: trimmed.slice(prefix.length).trim(),
      };
    }
  }
  const colon = trimmed.indexOf(": ");
  if (colon > 0 && colon < 90) {
    return {
      title: trimmed.slice(0, colon).trim(),
      body: trimmed.slice(colon + 2).trim(),
    };
  }
  return { title: trimmed, body: "" };
}

function secondSpanPresent(payload: ParsedAiFixPayload): boolean {
  const second = payload.second;
  if (!second) return false;
  return Boolean(
    second.anchorText.trim() ||
      second.deleteText.trim() ||
      second.insertText.trim()
  );
}

/** A tracked change that touches one span in one field. */
function singleSpanSuggestion(
  comment: CardComment
): { deleteText: string; insertText: string } | null {
  if (comment.kind === "ai_redraft") return null;
  const payload = parseAiFixCommentContent(comment.content);
  if (
    payload.tableOperation ||
    payload.tableOperationInvalid ||
    payload.identityOperation ||
    payload.insertImage ||
    payload.removeImage ||
    secondSpanPresent(payload)
  ) {
    return null;
  }
  const deleteText = payload.deleteText.trim();
  const insertText = payload.insertText.trim();
  if (!deleteText && !insertText) return null;
  return { deleteText, insertText };
}

/** Held = Review created it and it is not in the document queue yet. */
function commentIsHeld(comment: CardComment): boolean {
  return !comment.evaluationId && !commentReleasedToQueue(comment.content);
}

function findingLocate(finding: ReviewFindingDto): ReviewLocateTarget | null {
  if (!finding.section) return null;
  if (!finding.contentPath) {
    return { section: finding.section, contentPath: null, anchor: "", needle: "" };
  }
  const { focusText, focusOccurrence } = finding.metadata;
  return {
    section: finding.section,
    contentPath: finding.contentPath,
    anchor: finding.anchorText,
    needle: typeof focusText === "string" ? focusText : "",
    ...(typeof focusOccurrence === "number" ? { occurrence: focusOccurrence } : {}),
  };
}

function suggestedTextFromMetadata(metadata: Record<string, unknown>): string | null {
  const text = metadata.suggestedText;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export function reviewFindingCardModel(args: {
  finding: ReviewFindingDto;
  check: Pick<ReviewCheckDto, "label"> | null;
  sectionLabel: string | null;
  sectionNumber: number | null;
  criterionLabel: string | null;
  comment: CardComment | null;
}): ReviewFindingCardModel {
  const { finding } = args;
  const criterionKey =
    typeof finding.metadata.criterionKey === "string"
      ? finding.metadata.criterionKey
      : null;
  const head = [args.sectionNumber != null ? `§${args.sectionNumber}` : null, criterionKey]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const location = args.sectionLabel
    ? head
      ? `${head} · ${args.sectionLabel}`
      : args.sectionLabel
    : head || args.check?.label || "Review";

  const { title, body } = splitTitleBody(finding.message, args.criterionLabel);
  const kicker =
    args.check &&
    args.check.label !== title &&
    !args.check.label.endsWith(" criteria")
      ? args.check.label
      : null;
  const base = { location, kicker, title, body };

  const comment =
    args.comment &&
    args.comment.status === "open" &&
    isAiSuggestionKind(args.comment.kind)
      ? args.comment
      : null;

  if (comment) {
    const section = finding.section;
    const contentPath = comment.contentPath ?? finding.contentPath ?? null;
    const span = singleSpanSuggestion(comment);
    const locate: ReviewLocateTarget | null = section
      ? span && contentPath
        ? {
            section,
            contentPath,
            anchor: comment.anchorText,
            needle: span.deleteText,
          }
        : { section, contentPath, anchor: "", needle: "" }
      : null;
    return {
      ...base,
      suggestion: span
        ? { kind: "replacement", ...span }
        : { kind: "multi_part" },
      primary: commentIsHeld(comment) ? "apply" : "view",
      locate,
    };
  }

  const proposed = proposedEditFromMetadata(finding.metadata);
  if (proposed && finding.section && finding.contentPath) {
    return {
      ...base,
      suggestion: {
        kind: "replacement",
        deleteText: proposed.deleteText.trim(),
        insertText: proposed.insertText.trim(),
      },
      primary: "apply",
      locate: {
        section: finding.section,
        contentPath: finding.contentPath,
        anchor: proposed.anchorText,
        needle: proposed.deleteText,
      },
    };
  }

  if (
    canGenerateReviewSuggestion(finding) ||
    (finding.section && finding.contentPath)
  ) {
    return {
      ...base,
      suggestion: {
        kind: "draft_on_apply",
        suggestedText: suggestedTextFromMetadata(finding.metadata),
      },
      primary: "apply",
      locate: findingLocate(finding),
    };
  }

  return {
    ...base,
    suggestion: { kind: "none" },
    primary: "none",
    locate: findingLocate(finding),
  };
}
