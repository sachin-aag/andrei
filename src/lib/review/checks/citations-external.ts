import { iterReportFields } from "../fields";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

/** SOP / QMS / regulation identifiers that may live outside the vault. */
export const EXTERNAL_REF_RE =
  /\b(?:SOP(?:\/[A-Z]{2,})?(?:\/[A-Z0-9]+)+|QAD(?:-SOP)?(?:-[A-Z0-9]+)+|21\s*CFR\s*\d+(?:\.\d+)*|ICH\s*Q\d+(?:\(R\d+\))?|ISO\s*\d+(?::\d+)?)\b/gi;

function filenameHaystack(filenames: readonly string[]): string {
  return filenames.join("\n").toLowerCase();
}

export function externalRefFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections" | "attachmentFilenames">
): ReviewFindingDraft[] {
  const findings: ReviewFindingDraft[] = [];
  const haystack = filenameHaystack(ctx.attachmentFilenames);
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    EXTERNAL_REF_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXTERNAL_REF_RE.exec(field.text)) !== null) {
      const token = match[0];
      const needle = token.toLowerCase().replace(/\s+/g, "");
      const attached = ctx.attachmentFilenames.some((name) => {
        const compact = name.toLowerCase().replace(/\s+/g, "");
        return compact.includes(needle) || haystack.includes(token.toLowerCase());
      });
      if (attached) continue;
      findings.push({
        section: field.section,
        contentPath: field.contentPath,
        anchorText: token,
        message: `Please verify ${token} — it is not in the attached vault files.`,
        severity: "info",
        kind: "needs_human",
      });
    }
  }
  return findings;
}

export async function runExternalRefsCheck(
  ctx: ReviewRunContext
): Promise<ReviewCheckResult> {
  return { findings: externalRefFindings(ctx) };
}
