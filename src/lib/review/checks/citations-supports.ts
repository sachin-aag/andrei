import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveGoogleLanguageModel } from "@/lib/ai/resolve-google-language-model";
import { langfuseGenerateTextTelemetry } from "@/lib/observability/langfuse";
import { assertAiBudgetAvailable, recordAiUsage } from "@/lib/ai/usage";
import { CRITERIA_EVAL_GOOGLE_MODEL_ID } from "@/lib/ai/evaluate";
import { isTestStubReview } from "@/lib/test/ai-bypass";
import {
  canonicalizeSourceCitationBracket,
  citationNumbersFromMarker,
  isNumericCitationMarker,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";
import { sourceCitationForNumber } from "@/lib/suggestions/citations-at-end";
import {
  readDocumentPage,
  searchReportDocuments,
} from "@/lib/attachments/retrieval";
import { persistLocatedEdit } from "../persist-suggestion";
import { iterReportFields } from "../fields";
import { REVIEW_CITATION_PROMPT_VERSION } from "../prompts";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

const NUMERIC_MARKER_RE = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;

const supportSchema = z.object({
  status: z.enum(["supported", "partial", "unsupported"]),
  reasoning: z.string().min(1).max(800),
});

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const after = text.indexOf(".", index + length);
  const end = after === -1 ? Math.min(text.length, index + length + 180) : after + 1;
  return text.slice(start, end).trim();
}

export async function runCitationSupportsCheck(
  ctx: ReviewRunContext
): Promise<ReviewCheckResult> {
  if (isTestStubReview()) {
    return {
      findings: [
        {
          section: null,
          contentPath: null,
          anchorText: "",
          message: "Stub citation-support review (ALLOW_TEST_STUB_REVIEW).",
          severity: "info",
          kind: "needs_human",
        },
      ],
    };
  }

  const findings: ReviewFindingDraft[] = [];
  const model = resolveGoogleLanguageModel(CRITERIA_EVAL_GOOGLE_MODEL_ID, {
    vertexLocation: "global",
  });

  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    NUMERIC_MARKER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = NUMERIC_MARKER_RE.exec(field.text)) !== null) {
      if (!isNumericCitationMarker(match[0])) continue;
      const n = citationNumbersFromMarker(match[0])[0];
      if (n == null) continue;
      const source = sourceCitationForNumber(field.text, n);
      if (!source) continue;
      const parsed = parseSourceCitation(source, ctx.attachmentFilenames);
      const page = parsed?.pages[0];
      const attachmentId = parsed
        ? ctx.attachmentByFilename.get(parsed.filename) ??
          [...ctx.attachmentByFilename.entries()].find(
            ([name]) => name.toLowerCase() === parsed.filename.toLowerCase()
          )?.[1]
        : undefined;
      if (!parsed || page == null || !attachmentId) {
        findings.push({
          section: field.section,
          contentPath: field.contentPath,
          anchorText: match[0],
          message: `${match[0]} cannot be checked automatically. Please verify ${source}.`,
          severity: "warning",
          kind: "needs_human",
        });
        continue;
      }

      const read = await readDocumentPage({
        reportId: ctx.report.id,
        attachmentId,
        pageNumber: page,
      });
      const quote = [read?.transcript, read?.visualInterpretation]
        .filter(Boolean)
        .join("\n")
        .slice(0, 6000);
      if (!quote.trim()) {
        findings.push({
          section: field.section,
          contentPath: field.contentPath,
          anchorText: match[0],
          message: `${match[0]} cites a page with no extracted text. Please verify ${source}.`,
          severity: "warning",
          kind: "needs_human",
        });
        continue;
      }

      const claim = sentenceAround(field.text, match.index, match[0].length);
      await assertAiBudgetAvailable();
      const result = await generateText({
        model,
        output: Output.object({ schema: supportSchema }),
        system:
          "Judge whether the cited page supports the claim. Do not invent sources.",
        prompt: `CLAIM:\n${claim}\n\nCITED PAGE (${parsed.filename}, p. ${page}):\n${quote}\n\nReturn supported, partial, or unsupported.`,
        ...langfuseGenerateTextTelemetry({
          functionId: "review-citation-supports",
          metadata: {
            feature: "review-check",
            promptVersion: REVIEW_CITATION_PROMPT_VERSION,
          },
        }),
      });
      await recordAiUsage({
        feature: "review_check",
        modelId: CRITERIA_EVAL_GOOGLE_MODEL_ID,
        usage: result.usage,
        reportId: ctx.report.id,
      });
      const judgement = result.experimental_output;
      if (!judgement || judgement.status === "supported") continue;
      const needsHuman: ReviewFindingDraft = {
        section: field.section,
        contentPath: field.contentPath,
        anchorText: match[0],
        message: `${match[0]} ${judgement.status}: ${judgement.reasoning}`,
        severity: judgement.status === "unsupported" ? "error" : "warning",
        kind: "needs_human",
        metadata: { citationNumber: n, source },
      };
      try {
        const hits = await searchReportDocuments({
          reportId: ctx.report.id,
          query: claim,
          limit: 3,
        });
        const better = hits.find(
          (hit) =>
            hit.filename.toLowerCase() !== parsed.filename.toLowerCase() ||
            hit.pageNumber !== page
        );
        if (!better) {
          findings.push(needsHuman);
          continue;
        }
        const replacement = canonicalizeSourceCitationBracket(
          `[${better.filename}, p. ${better.pageNumber}]`
        );
        const persisted = await persistLocatedEdit({
          ctx,
          section: field.section,
          contentPath: field.contentPath,
          edit: {
            anchorText: source,
            deleteText: source,
            insertText: replacement,
          },
          reasoning: `${match[0]} is ${judgement.status} on the cited page. Replace the Citations line with ${replacement}.`,
          kind: "ai_fix",
        });
        findings.push(persisted ?? needsHuman);
      } catch {
        findings.push(needsHuman);
      }
    }
  }
  return { findings };
}
