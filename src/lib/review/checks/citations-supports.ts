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

export const CITATION_SUPPORT_MAX_CLAIMS = 24;
export const CITATION_SUPPORT_BATCH_SIZE = 8;

const batchSupportSchema = z.object({
  judgements: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      status: z.enum(["supported", "partial", "unsupported"]),
      reasoning: z.string().min(1).max(800),
    })
  ),
});

export type CitationSupportJob = {
  section: string;
  contentPath: string;
  marker: string;
  citationNumber: number;
  source: string;
  claim: string;
  filename: string;
  page: number;
  attachmentId: string;
};

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(".", index) + 1);
  const after = text.indexOf(".", index + length);
  const end = after === -1 ? Math.min(text.length, index + length + 180) : after + 1;
  return text.slice(start, end).trim();
}

export function collectCitationSupportJobs(
  ctx: Pick<
    ReviewRunContext,
    "documentType" | "sections" | "attachmentFilenames" | "attachmentByFilename"
  >
): { jobs: CitationSupportJob[]; unresolved: ReviewFindingDraft[] } {
  const jobs: CitationSupportJob[] = [];
  const unresolved: ReviewFindingDraft[] = [];

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
        unresolved.push({
          section: field.section,
          contentPath: field.contentPath,
          anchorText: match[0],
          message: `${match[0]} cannot be checked automatically. Please verify ${source}.`,
          severity: "warning",
          kind: "needs_human",
        });
        continue;
      }
      jobs.push({
        section: field.section,
        contentPath: field.contentPath,
        marker: match[0],
        citationNumber: n,
        source,
        claim: sentenceAround(field.text, match.index, match[0].length),
        filename: parsed.filename,
        page,
        attachmentId,
      });
    }
  }
  return { jobs, unresolved };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
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

  const { jobs: allJobs, unresolved } = collectCitationSupportJobs(ctx);
  const findings: ReviewFindingDraft[] = [...unresolved];
  const overflow = allJobs.length - CITATION_SUPPORT_MAX_CLAIMS;
  const jobs = allJobs.slice(0, CITATION_SUPPORT_MAX_CLAIMS);
  if (overflow > 0) {
    findings.push({
      section: null,
      contentPath: null,
      anchorText: "",
      message: `${overflow} more citation(s) were not judged this pass. Fix the first ${CITATION_SUPPORT_MAX_CLAIMS}, then run Citation supports again.`,
      severity: "info",
      kind: "needs_human",
    });
  }

  const quoted = (
    await Promise.all(
      jobs.map(async (job) => {
        const read = await readDocumentPage({
          reportId: ctx.report.id,
          attachmentId: job.attachmentId,
          pageNumber: job.page,
        });
        const quote = [read?.transcript, read?.visualInterpretation]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000);
        if (!quote.trim()) {
          findings.push({
            section: job.section,
            contentPath: job.contentPath,
            anchorText: job.marker,
            message: `${job.marker} cites a page with no extracted text. Please verify ${job.source}.`,
            severity: "warning",
            kind: "needs_human",
          });
          return null;
        }
        return { job, quote };
      })
    )
  ).filter((row): row is { job: CitationSupportJob; quote: string } => row != null);

  if (quoted.length === 0) return { findings };

  const model = resolveGoogleLanguageModel(CRITERIA_EVAL_GOOGLE_MODEL_ID, {
    vertexLocation: "global",
  });

  const batches = chunk(quoted, CITATION_SUPPORT_BATCH_SIZE);
  const judged = await Promise.all(
    batches.map(async (batch) => {
      await assertAiBudgetAvailable();
      const prompt = batch
        .map(
          (row, index) =>
            `CLAIM ${index}:\n${row.job.claim}\n\nCITED PAGE ${index} (${row.job.filename}, p. ${row.job.page}):\n${row.quote}`
        )
        .join("\n\n---\n\n");
      const result = await generateText({
        model,
        output: Output.object({ schema: batchSupportSchema }),
        system:
          "Judge whether each cited page supports its claim. Return one judgement per CLAIM index. Do not invent sources.",
        prompt: `${prompt}\n\nReturn judgements for every CLAIM index.`,
        ...langfuseGenerateTextTelemetry({
          functionId: "review-citation-supports",
          metadata: {
            feature: "review-check",
            promptVersion: REVIEW_CITATION_PROMPT_VERSION,
            batchSize: batch.length,
          },
        }),
      });
      await recordAiUsage({
        feature: "review_check",
        modelId: CRITERIA_EVAL_GOOGLE_MODEL_ID,
        usage: result.usage,
        reportId: ctx.report.id,
      });
      return { batch, judgements: result.experimental_output?.judgements ?? [] };
    })
  );

  for (const { batch, judgements } of judged) {
    for (const [index, row] of batch.entries()) {
      const judgement = judgements.find((item) => item.index === index);
      if (!judgement || judgement.status === "supported") continue;
      const needsHuman: ReviewFindingDraft = {
        section: row.job.section,
        contentPath: row.job.contentPath,
        anchorText: row.job.marker,
        message: `${row.job.marker} ${judgement.status}: ${judgement.reasoning}`,
        severity: judgement.status === "unsupported" ? "error" : "warning",
        kind: "needs_human",
        metadata: {
          citationNumber: row.job.citationNumber,
          source: row.job.source,
        },
      };
      try {
        const hits = await searchReportDocuments({
          reportId: ctx.report.id,
          query: row.job.claim,
          limit: 3,
        });
        const better = hits.find(
          (hit) =>
            hit.filename.toLowerCase() !== row.job.filename.toLowerCase() ||
            hit.pageNumber !== row.job.page
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
          section: row.job.section,
          contentPath: row.job.contentPath,
          edit: {
            anchorText: row.job.source,
            deleteText: row.job.source,
            insertText: replacement,
          },
          reasoning: `${row.job.marker} is ${judgement.status} on the cited page. Replace the Citations line with ${replacement}.`,
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
