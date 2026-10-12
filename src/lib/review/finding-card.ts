import {
  isAiSuggestionKind,
  parseAiFixCommentContent,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import type { ReviewCheckDto, ReviewFindingDto } from "./ui";

export type ReviewLocateTarget = {
  section: string;
  contentPath: string;
  needle: string;
};

export type ReviewLocateHighlight = ReviewLocateTarget & {
  findingId: string;
};

export type ReviewFindingCardModel = {
  location: string;
  kicker: string | null;
  title: string;
  body: string;
  replacement: string | null;
  /** One phrase in one field. Null when the finding is split or has no anchor. */
  locate: ReviewLocateTarget | null;
  /** Open single-span AI suggestion to promote into the tracked-change queue. */
  applyCommentId: string | null;
};

type CardComment = {
  id: string;
  status: string;
  kind: string;
  content: string;
  anchorText: string;
  contentPath: string | null;
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
function singleSpanSuggestion(comment: CardComment): {
  needle: string;
  replacement: string | null;
} | null {
  if (comment.status !== "open" || !isAiSuggestionKind(comment.kind)) return null;
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
  const needle = payload.deleteText.trim() || comment.anchorText.trim();
  if (!needle) return null;
  const replacement = payload.insertText.trim();
  return { needle, replacement: replacement || null };
}

export function reviewFindingCardModel(args: {
  finding: ReviewFindingDto;
  check: Pick<ReviewCheckDto, "label"> | null;
  sectionLabel: string | null;
  sectionNumber: number | null;
  criterionLabel: string | null;
  comment: CardComment | null;
}): ReviewFindingCardModel {
  const criterionKey =
    typeof args.finding.metadata.criterionKey === "string"
      ? args.finding.metadata.criterionKey
      : null;
  const head = [args.sectionNumber != null ? `§${args.sectionNumber}` : null, criterionKey]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const location = args.sectionLabel
    ? head
      ? `${head} · ${args.sectionLabel}`
      : args.sectionLabel
    : head || args.check?.label || "Review";

  const { title, body } = splitTitleBody(
    args.finding.message,
    args.criterionLabel
  );
  const kicker =
    args.check &&
    args.check.label !== title &&
    !args.check.label.endsWith(" criteria")
      ? args.check.label
      : null;

  const span = args.comment ? singleSpanSuggestion(args.comment) : null;
  const section = args.finding.section;
  const contentPath =
    args.comment?.contentPath ?? args.finding.contentPath ?? null;
  const fallbackNeedle = args.finding.anchorText.trim();
  const locate =
    section && contentPath
      ? span
        ? { section, contentPath, needle: span.needle }
        : !args.comment && fallbackNeedle
          ? { section, contentPath, needle: fallbackNeedle }
          : null
      : null;

  return {
    location,
    kicker,
    title,
    body,
    replacement: span?.replacement ?? null,
    locate,
    applyCommentId: span && args.comment ? args.comment.id : null,
  };
}
