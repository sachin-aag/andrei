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
import { locateProposedEdit } from "../persist-suggestion";
import { iterReportFields } from "../fields";
import { locateFieldsForMatch, type ReviewLocateMetadata } from "../locate";
import { REVIEW_CITATION_PROMPT_VERSION } from "../prompts";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";
import {
  claimWindowForCitation,
  matchClaimToCitedPage,
  supportMatchMessage,
} from "./citation-support-match";

const NUMERIC_MARKER_RE = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;

export const CITATION_SUPPORT_MAX_CLAIMS = 24;
export const CITATION_SUPPORT_BATCH_SIZE = 8;

export const CITATION_SUPPORT_SYSTEM_PROMPT = `Judge whether each cited page supports its claim.
Return one judgement per CLAIM index. Do not invent sources.

Use supported only when:
- Hard facts in the claim (dates, IDs, numbers with their units) appear on the page, AND
- The subject matches. The same number for a different vessel, URS ID, equipment, batch, loop, or row is unsupported.

Use unsupported when facts are missing or clearly belong to a different subject.
Use partial when OCR or layout makes the subject unclear. Partial means a human must confirm — do not guess supported.`;

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
  /** Unique phrase around `marker` so the right `[n]` copy highlights. */
  anchorText: string;
  locateMetadata: ReviewLocateMetadata;
  citationNumber: number;
  source: string;
  claim: string;
  filename: string;
  page: number;
  attachmentId: string;
};

function pageQuoteFromRead(read: {
  transcript?: string | null;
  visualInterpretation?: string | null;
} | null): string {
  return [read?.transcript, read?.visualInterpretation]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
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
      const located = locateFieldsForMatch(field.text, match.index, match[0]);
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
          anchorText: located.anchorText,
          message: `${match[0]} cannot be checked automatically. Please verify ${source}.`,
          severity: "major",
          kind: "needs_human",
          metadata: located.metadata,
        });
        continue;
      }
      jobs.push({
        section: field.section,
        contentPath: field.contentPath,
        marker: match[0],
        anchorText: located.anchorText,
        locateMetadata: located.metadata,
        citationNumber: n,
        source,
        claim: claimWindowForCitation(
          field.text,
          match.index,
          match[0].length,
          field.doc
        ),
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

function humanFinding(
  job: CitationSupportJob,
  message: string,
  severity: ReviewFindingDraft["severity"]
): ReviewFindingDraft {
  return {
    section: job.section,
    contentPath: job.contentPath,
    anchorText: job.anchorText,
    message,
    severity,
    kind: "needs_human",
    metadata: {
      citationNumber: job.citationNumber,
      source: job.source,
      ...job.locateMetadata,
    },
  };
}

async function proposeBetterCitation(
  ctx: ReviewRunContext,
  job: CitationSupportJob,
  fallback: ReviewFindingDraft
): Promise<ReviewFindingDraft> {
  try {
    const hits = await searchReportDocuments({
      reportId: ctx.report.id,
      query: job.claim,
      limit: 3,
    });
    for (const hit of hits) {
      if (
        hit.filename.toLowerCase() === job.filename.toLowerCase() &&
        hit.pageNumber === job.page
      ) {
        continue;
      }
      const read = await readDocumentPage({
        reportId: ctx.report.id,
        attachmentId: hit.attachmentId,
        pageNumber: hit.pageNumber,
      });
      const quote = pageQuoteFromRead(read);
      if (matchClaimToCitedPage(job.claim, quote).status !== "supported") {
        continue;
      }
      const replacement = canonicalizeSourceCitationBracket(
        `[${hit.filename}, p. ${hit.pageNumber}]`
      );
      const persisted = locateProposedEdit({
        ctx,
        section: job.section,
        contentPath: job.contentPath,
        edit: {
          anchorText: job.source,
          deleteText: job.source,
          insertText: replacement,
        },
        reasoning: `${job.marker} does not support this claim on ${job.source}. Replace the Citations line with ${replacement}.`,
        kind: "ai_fix",
        severity: fallback.severity,
      });
      if (persisted) return persisted;
    }
  } catch {
    return fallback;
  }
  return fallback;
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
          severity: "minor",
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
      severity: "minor",
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
        const quote = pageQuoteFromRead(read);
        if (!quote.trim()) {
          findings.push(
            humanFinding(
              job,
              `${job.marker} cites a page with no extracted text. Please verify ${job.source}.`,
              "major"
            )
          );
          return null;
        }
        return { job, quote };
      })
    )
  ).filter((row): row is { job: CitationSupportJob; quote: string } => row != null);

  const forModel: Array<{ job: CitationSupportJob; quote: string }> = [];
  for (const row of quoted) {
    const match = matchClaimToCitedPage(row.job.claim, row.quote);
    if (match.status === "supported") continue;
    if (match.status === "needs_model") {
      forModel.push(row);
      continue;
    }
    const fallback = humanFinding(
      row.job,
      supportMatchMessage(row.job.marker, row.job.source, match),
      "critical"
    );
    findings.push(await proposeBetterCitation(ctx, row.job, fallback));
  }

  if (forModel.length === 0) return { findings };

  const model = resolveGoogleLanguageModel(CRITERIA_EVAL_GOOGLE_MODEL_ID, {
    vertexLocation: "global",
  });

  const batches = chunk(forModel, CITATION_SUPPORT_BATCH_SIZE);
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
        system: CITATION_SUPPORT_SYSTEM_PROMPT,
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
      if (judgement?.status === "supported") continue;
      const status = judgement?.status ?? "partial";
      const reasoning =
        judgement?.reasoning ??
        "The checker could not judge this citation. Please confirm the cited page matches this claim's subject and facts.";
      const needsHuman = humanFinding(
        row.job,
        `${row.job.marker} ${status}: ${reasoning}`,
        status === "unsupported" ? "critical" : "major"
      );
      if (status === "partial") {
        findings.push(needsHuman);
        continue;
      }
      findings.push(await proposeBetterCitation(ctx, row.job, needsHuman));
    }
  }
  return { findings };
}
