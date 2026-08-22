import { isCitationShapedBracket } from "@/lib/placeholders/citation-bracket";
import type { EditScope } from "@/lib/suggestions/locator";
import type { TableOperation } from "@/lib/suggestions/table-operation";

export type SuggestionEditPart = {
  anchorText: string;
  deleteText: string;
  insertText: string;
  scope?: EditScope;
};

export type SplitSuggestionEdit = SuggestionEditPart & {
  second?: SuggestionEditPart;
};

const BRACKET_RE = /\[[^\]]+\]/g;

export function documentCitationRule(citationsAtEndOfSection: boolean): string {
  if (citationsAtEndOfSection) {
    return "Cite evidence as [filename, p. N] when the page is known, or [filename] when it is not. Place those citations at the end of the section field, not inline beside the claim. For a body change plus a new citation, use one split edit (primary + second). Never use <to be filled> in a citation.";
  }
  return "Cite evidence in prose as [filename, p. N] when the page is known, or [filename] when it is not. Never use <to be filled> in a citation.";
}

function uniquePreserveOrder(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function findCitationSpans(
  text: string
): Array<{ start: number; end: number; text: string }> {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  BRACKET_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_RE.exec(text)) !== null) {
    if (!isCitationShapedBracket(match[0])) continue;
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return spans;
}

/** Citation brackets in `text`, in document order, de-duplicated. */
export function extractCitationBrackets(text: string): string[] {
  return uniquePreserveOrder(findCitationSpans(text).map((span) => span.text));
}

export function isCitationOnlyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const { prose, citations } = stripCitationsFromText(trimmed);
  return citations.length > 0 && prose.trim() === "";
}

/**
 * Remove document citations from `text` and return the leftover prose.
 * Preserves a single leading space when the original insert was mid-sentence.
 */
export function stripCitationsFromText(text: string): {
  prose: string;
  citations: string[];
} {
  const spans = findCitationSpans(text);
  if (spans.length === 0) return { prose: text, citations: [] };

  let prose = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]!;
    prose = prose.slice(0, span.start) + prose.slice(span.end);
  }
  prose = prose.replace(/[ \t]+([,.;:!?])/g, "$1");
  prose = prose.replace(/\(\s*\)/g, "");
  prose = prose.replace(/[ \t]{2,}/g, " ");
  const hadLeadingSpace = /^\s/.test(text);
  prose = prose.replace(/[ \t]+$/g, "");
  prose = prose.replace(/^[ \t]+/, hadLeadingSpace && prose.trim() ? " " : "");
  if (/^[.,;:!?]*$/.test(prose.trim())) {
    prose = "";
  }
  return {
    prose,
    citations: uniquePreserveOrder(spans.map((span) => span.text)),
  };
}

function isCitationOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const { prose, citations } = stripCitationsFromText(trimmed);
  return citations.length > 0 && prose.trim() === "";
}

function isReferencesHeading(line: string): boolean {
  return /^#{0,6}\s*references\s*$/i.test(line.trim());
}

function splitTrailingCitationBlock(text: string): {
  body: string;
  trailingCitations: string[];
} {
  const lines = text.split("\n");
  const citations: string[] = [];
  let i = lines.length - 1;
  while (i >= 0 && lines[i]!.trim() === "") i--;
  while (i >= 0 && isCitationOnlyLine(lines[i]!)) {
    citations.unshift(...extractCitationBrackets(lines[i]!));
    i--;
  }
  if (i >= 0 && isReferencesHeading(lines[i]!)) {
    i--;
  }
  while (i >= 0 && lines[i]!.trim() === "") i--;
  return {
    body: lines.slice(0, i + 1).join("\n"),
    trailingCitations: uniquePreserveOrder(citations),
  };
}

/**
 * Move inline document citations to a trailing block at the end of `text`.
 * Used for whole-field drafts when citations-at-end mode is on.
 */
export function moveCitationsToEndOfText(text: string): string {
  const { body, trailingCitations } = splitTrailingCitationBlock(text);
  const { prose, citations } = stripCitationsFromText(body);
  const all = uniquePreserveOrder([...trailingCitations, ...citations]);
  if (all.length === 0) return text;
  const bodyOut = prose.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
  return `${bodyOut}${bodyOut ? "\n\n" : ""}${all.join("\n")}`;
}

function hasPartContent(part: Pick<SuggestionEditPart, "deleteText" | "insertText">): boolean {
  return Boolean(part.deleteText.trim() || part.insertText.trim());
}

function citationInsertText(citations: readonly string[]): string {
  return citations.join("\n");
}

function citationsAlreadyInField(
  citations: readonly string[],
  existingFieldText: string
): string[] {
  if (!existingFieldText) return [...citations];
  return citations.filter((citation) => !existingFieldText.includes(citation));
}

/**
 * Split a single-site edit so new citations land at the end of the field.
 * No-op when the insert has no citation brackets (and no `second` part).
 */
export function splitEditForCitationsAtEnd(
  edit: SplitSuggestionEdit,
  opts?: { existingFieldText?: string }
): SplitSuggestionEdit {
  const fromPrimary = stripCitationsFromText(edit.insertText);
  const fromSecond = edit.second
    ? stripCitationsFromText(edit.second.insertText)
    : { prose: "", citations: [] };

  const leftoverSecondProse = fromSecond.prose.trim();
  const endLines = uniquePreserveOrder([
    ...fromPrimary.citations,
    ...fromSecond.citations,
    ...(leftoverSecondProse ? [leftoverSecondProse] : []),
  ]);
  const newCitations = citationsAlreadyInField(
    endLines,
    opts?.existingFieldText ?? ""
  );

  const primary: SuggestionEditPart = {
    anchorText: edit.anchorText,
    deleteText: edit.deleteText,
    insertText: fromPrimary.prose,
    scope: edit.scope,
  };

  if (newCitations.length === 0) {
    return primary;
  }

  const citationPart: SuggestionEditPart = {
    anchorText: edit.second?.anchorText ?? "",
    deleteText: edit.second?.deleteText ?? "",
    insertText: citationInsertText(newCitations),
    scope: edit.second?.scope,
  };

  if (!hasPartContent(primary)) {
    return citationPart;
  }

  return { ...primary, second: citationPart };
}

/**
 * Apply pack policy: drop `second` when the mode is off; split citations
 * to the end when it is on.
 */
export function prepareEditForCitationMode<T extends SplitSuggestionEdit>(
  edit: T,
  opts: { citationsAtEndOfSection: boolean; existingFieldText?: string }
): T {
  if (!opts.citationsAtEndOfSection) {
    if (!edit.second) return edit;
    const { second: _drop, ...rest } = edit;
    return rest as T;
  }
  return { ...edit, ...splitEditForCitationsAtEnd(edit, opts) };
}

/**
 * Strip citation brackets from table-operation cell/row/header strings so
 * they can be appended at the end of the field as a split `second` part.
 */
export function stripCitationsFromTableOperation(operation: TableOperation): {
  operation: TableOperation;
  citations: string[];
} {
  const citations: string[] = [];
  const take = (value: string): string => {
    const { prose, citations: found } = stripCitationsFromText(value);
    citations.push(...found);
    return prose;
  };

  switch (operation.kind) {
    case "edit_cells":
      return {
        operation: {
          ...operation,
          cells: operation.cells.map((cell) => ({
            ...cell,
            insertText: take(cell.insertText),
          })),
        },
        citations: uniquePreserveOrder(citations),
      };
    case "insert_rows":
      return {
        operation: {
          ...operation,
          rows: operation.rows.map((row) => row.map((cell) => take(cell))),
        },
        citations: uniquePreserveOrder(citations),
      };
    case "insert_column":
      return {
        operation: {
          ...operation,
          header: take(operation.header),
          values: operation.values?.map((value) => take(value)),
        },
        citations: uniquePreserveOrder(citations),
      };
    case "delete_rows":
    case "delete_column":
      return { operation, citations: [] };
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}

export function citationAppendPart(
  citations: readonly string[],
  existingFieldText = ""
): SuggestionEditPart | undefined {
  const fresh = citationsAlreadyInField(citations, existingFieldText);
  if (fresh.length === 0) return undefined;
  return {
    anchorText: "",
    deleteText: "",
    insertText: citationInsertText(fresh),
  };
}
