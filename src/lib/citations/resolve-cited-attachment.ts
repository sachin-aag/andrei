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

  const byId = attachments.filter((item) => item.id === cited);
  if (byId.length === 1) return { status: "found", attachment: byId[0]! };

  const citedNorm = normalizeFilename(basename(cited));
  const exact = attachments.filter(
    (item) => normalizeFilename(basename(item.filename)) === citedNorm
  );
  if (exact.length === 1) return { status: "found", attachment: exact[0]! };
  if (exact.length > 1) return { status: "found", attachment: exact[0]! };

  const fuzzy = attachments.filter((item) =>
    filenameMatches(item.filename, cited)
  );
  if (fuzzy.length === 1) return { status: "found", attachment: fuzzy[0]! };
  if (fuzzy.length > 1) return { status: "ambiguous" };
  return { status: "missing" };
}
