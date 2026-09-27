import { citationDisplayFilename } from "@/lib/citations/citation-filename";

/** Same shape as `@paralleldrive/cuid2` `createId()` (attachment / analysis keys). */
const INTERNAL_ID_TOKEN = /^[a-z0-9]{24}$/i;
const HAS_INTERNAL_ID = /[a-z0-9]{24}/i;
const INTERNAL_ID_IN_TEXT = /[a-z0-9]{24}/gi;
const ID_ASSIGNMENT =
  /\b(?:attachmentId|analysisId|id)=([a-z0-9]{24})\b/gi;
const ID_IN_PARENS = /\s*\(([a-z0-9]{24})\)/gi;

export type InternalIdDisplayLookup = {
  /** Attachment primary keys → filename shown in `[filename, p. N]`. */
  filenameByAttachmentId?: ReadonlyMap<string, string>;
  /** Other internal handles (plots, columns, sheets) → engineer-facing name. */
  labelById?: ReadonlyMap<string, string>;
};

function indexByLowerId(
  map: ReadonlyMap<string, string> | undefined
): Map<string, string> {
  const out = new Map<string, string>();
  if (!map) return out;
  for (const [id, label] of map) {
    const key = id.trim().toLowerCase();
    const value = label.trim();
    if (key && value) out.set(key, value);
  }
  return out;
}

export function isInternalIdToken(value: string): boolean {
  return INTERNAL_ID_TOKEN.test(value.trim());
}

function attachmentLabel(
  id: string,
  filenames: ReadonlyMap<string, string>
): string | null {
  const filename = filenames.get(id.toLowerCase());
  if (!filename) return null;
  return citationDisplayFilename(filename) || filename;
}

function otherLabel(
  id: string,
  labels: ReadonlyMap<string, string>
): string | null {
  const label = labels.get(id.toLowerCase());
  return label || null;
}

function lookupLabel(
  id: string,
  filenames: ReadonlyMap<string, string>,
  labels: ReadonlyMap<string, string>
): string | null {
  return attachmentLabel(id, filenames) ?? otherLabel(id, labels);
}

/**
 * Rewrite a `[...]` whose core is an internal id. Attachment ids stay
 * citations (`[file.pdf, p. 1]`). Plot/column ids become the title, without
 * a fake source bracket when there is no page suffix.
 */
function rewriteBracket(
  inner: string,
  filenames: ReadonlyMap<string, string>,
  labels: ReadonlyMap<string, string>
): string {
  INTERNAL_ID_IN_TEXT.lastIndex = 0;
  const idAtStart = /^([a-z0-9]{24})(.*)$/i.exec(inner.trim());
  if (idAtStart) {
    const id = idAtStart[1]!;
    const rest = idAtStart[2] ?? "";
    const filename = attachmentLabel(id, filenames);
    if (filename) return `[${filename}${rest}]`;
    const title = otherLabel(id, labels);
    if (title) {
      if (!rest.trim()) return title;
      return `[${title}${rest}]`;
    }
  }

  const next = inner.replace(INTERNAL_ID_IN_TEXT, (id) => {
    return lookupLabel(id, filenames, labels) ?? id;
  });
  return `[${next}]`;
}

/**
 * Replace 24-character internal handles in assistant text with the filename
 * or title the engineer already knows. The model copies `id=` tokens from
 * the document index; those codes must not appear in chat.
 */
export function rewriteInternalIdsForDisplay(
  text: string,
  lookup: InternalIdDisplayLookup
): string {
  if (!text) return text;
  const filenames = indexByLowerId(lookup.filenameByAttachmentId);
  const labels = indexByLowerId(lookup.labelById);
  if (filenames.size === 0 && labels.size === 0) return text;

  let next = text.replace(ID_ASSIGNMENT, (full, id: string) => {
    return lookupLabel(id, filenames, labels) ?? full;
  });
  next = next.replace(ID_IN_PARENS, (full, id: string) => {
    return lookupLabel(id, filenames, labels) ? "" : full;
  });
  next = next.replace(/\[([^\]]+)\]/g, (_full, inner: string) => {
    if (!HAS_INTERNAL_ID.test(inner)) return `[${inner}]`;
    return rewriteBracket(inner, filenames, labels);
  });
  INTERNAL_ID_IN_TEXT.lastIndex = 0;
  next = next.replace(INTERNAL_ID_IN_TEXT, (id) => {
    return lookupLabel(id, filenames, labels) ?? id;
  });
  return next;
}
