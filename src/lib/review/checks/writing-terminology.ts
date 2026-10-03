import { iterReportFields } from "../fields";
import { persistLocatedEdit } from "../persist-suggestion";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

const TOKEN_RE = /\b[A-Z]{2,}[A-Z0-9/-]{1,}|\b(?:batch|lot|equipment)\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Z0-9][A-Z0-9/-]+\b/gi;

function normalizeToken(token: string): string {
  return token.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function terminologyFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections" | "report">
): ReviewFindingDraft[] {
  const groups = new Map<
    string,
    { forms: Map<string, number>; samples: ReviewFindingDraft[] }
  >();
  const cover = [
    String(ctx.report.documentNo ?? ""),
    ...Object.values(ctx.report.metadata ?? {}).filter(
      (value): value is string => typeof value === "string"
    ),
  ];

  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(field.text)) !== null) {
      const form = match[0].trim();
      if (form.length < 5) continue;
      const key = normalizeToken(form);
      if (key.length < 5) continue;
      const group = groups.get(key) ?? {
        forms: new Map<string, number>(),
        samples: [] as ReviewFindingDraft[],
      };
      group.forms.set(form, (group.forms.get(form) ?? 0) + 1);
      if (group.samples.length < 8) {
        group.samples.push({
          section: field.section,
          contentPath: field.contentPath,
          anchorText: form,
          message: "",
          severity: "warning",
          kind: "needs_human",
        });
      }
      groups.set(key, group);
    }
  }

  const findings: ReviewFindingDraft[] = [];
  for (const group of groups.values()) {
    if (group.forms.size < 2) continue;
    const ranked = [...group.forms.entries()].toSorted((a, b) => b[1] - a[1]);
    const preferred =
      cover.find((value) => group.forms.has(value)) ?? ranked[0]?.[0];
    if (!preferred) continue;
    const variants = ranked.map(([form]) => form).filter((form) => form !== preferred);
    if (variants.length === 0) continue;
    for (const sample of group.samples) {
      if (sample.anchorText === preferred) continue;
      findings.push({
        ...sample,
        message: `“${sample.anchorText}” is inconsistent with “${preferred}”.`,
        metadata: { preferred, variants },
      });
    }
  }
  return findings;
}

export async function runTerminologyCheck(
  ctx: ReviewRunContext
): Promise<ReviewCheckResult> {
  const findings: ReviewFindingDraft[] = [];
  for (const draft of terminologyFindings(ctx)) {
    const preferred =
      typeof draft.metadata?.preferred === "string" ? draft.metadata.preferred : null;
    if (!draft.section || !draft.contentPath || !preferred) {
      findings.push(draft);
      continue;
    }
    const persisted = await persistLocatedEdit({
      ctx,
      section: draft.section,
      contentPath: draft.contentPath,
      edit: {
        anchorText: draft.anchorText,
        deleteText: draft.anchorText,
        insertText: preferred,
      },
      reasoning: draft.message,
      kind: "ai_fix",
    });
    findings.push(persisted ?? draft);
  }
  return { findings };
}
