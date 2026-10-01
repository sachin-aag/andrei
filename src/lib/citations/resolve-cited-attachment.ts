import { filenameMatches, normalizeFilename } from "@/lib/attachments/retrieval-metrics";

export type CitedAttachment = {
  id: string;
  filename: string;
};

export type ResolveCitedAttachmentResult =
  | { status: "found"; attachment: CitedAttachment }
  | { status: "missing" }
  | { status: "ambiguous" };

function basename(filename: string): string {
  return filename.replace(/^.*[/\\]/, "").trim();
}

function exactFilenameHits(
  attachments: readonly CitedAttachment[],
  citedName: string
): CitedAttachment[] {
  const citedNorm = normalizeFilename(basename(citedName));
  if (!citedNorm) return [];
  return attachments.filter(
    (item) => normalizeFilename(basename(item.filename)) === citedNorm
  );
}

/**
 * Exact basename only (no includes-based fuzzy match). Use this when the
 * unsplit cite might be a real filename such as `E-PR-068 and E-PR-071.pdf`.
 */
export function resolveExactCitedAttachment(
  attachments: readonly CitedAttachment[],
  citedName: string
): ResolveCitedAttachmentResult {
  const cited = citedName.trim();
  if (!cited) return { status: "missing" };

  const byId = attachments.filter((item) => item.id === cited);
  if (byId.length === 1) return { status: "found", attachment: byId[0]! };

  const exact = exactFilenameHits(attachments, cited);
  if (exact.length >= 1) return { status: "found", attachment: exact[0]! };
  return { status: "missing" };
}

/**
 * Match a citation filename (or attachment id) to a report attachment.
 * Exact filename wins; otherwise a unique fuzzy match.
 */
export function resolveCitedAttachment(
  attachments: readonly CitedAttachment[],
  citedName: string
): ResolveCitedAttachmentResult {
  const cited = citedName.trim();
  if (!cited) return { status: "missing" };

  const exact = resolveExactCitedAttachment(attachments, cited);
  if (exact.status === "found") return exact;

  const fuzzy = attachments.filter((item) =>
    filenameMatches(item.filename, cited)
  );
  if (fuzzy.length === 1) return { status: "found", attachment: fuzzy[0]! };
  if (fuzzy.length > 1) return { status: "ambiguous" };
  return { status: "missing" };
}
