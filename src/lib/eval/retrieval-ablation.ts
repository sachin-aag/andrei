import {
  excerptContainsAny,
  excerptHitAtK,
  filenameMatches,
  noFalsePositiveAtK,
  recallAtK,
  type RankedFilenamePageText,
  type RetrievalEvalCase,
  type RetrievalGoldHit,
} from "@/lib/attachments/retrieval-metrics";
import {
  buildMatchCenteredSnippet,
  lexicalMatchScore,
  takeRankedHits,
} from "@/lib/attachments/retrieval-query";
import {
  DEFAULT_SNIPPET_CHARS,
  truncateSnippet,
} from "@/lib/attachments/retrieval";
import { ANDREI_BENCH_VERSION } from "@/lib/eval/chat-draft-cases";

export const RETRIEVAL_ABLATION_K = 5;

export type RetrievalCorpusPage = {
  filename: string;
  pageNumber: number;
  text: string;
};

export type RetrievalAblationArm = {
  hits: RankedFilenamePageText[];
  rightPage: boolean;
  rightExcerpt: boolean | null;
  noLeak: boolean | null;
  correct: boolean;
};

export type RetrievalAblationRow = {
  id: string;
  kind: RetrievalEvalCase["kind"];
  query: string;
  passCriteria: string;
  excerptApplicable: boolean;
  on: RetrievalAblationArm;
  off: RetrievalAblationArm;
};

export type RetrievalAblationReport = {
  benchVersion: string;
  n: number;
  excerptN: number;
  leakN: number;
  rightPageOn: number;
  rightPageOff: number;
  rightExcerptOn: number;
  rightExcerptOff: number;
  noLeakOn: number;
  noLeakOff: number;
  correctOn: number;
  correctOff: number;
  rows: RetrievalAblationRow[];
};

/**
 * Excerpt gold for the ranking ablation. Live `retrieval-eval` still judges
 * paraphrase via `passCriteria`; this map names the row/ID a prefix-900
 * excerpt must show. Needles that are not in the born-digital text layer
 * (URS-3 printed minus) are dropped at score time — do not fake the overlay.
 */
const EXCERPT_NEEDLES: Readonly<Record<string, readonly string[]>> = {
  "equipment-required-instrument": [
    "Portable Spectrum Analyzer",
    "Narda SRM-3006",
  ],
  "equipment-table-heading": ["Required Testing Equipment"],
  "equipment-executed-log-negative": ["Digital Calipers"],
  "equipment-page-2-locator": ["Required Testing Equipment"],
  "sw-eval-7-identifier": ["SW-EVAL-7"],
  "sw-eval-7-description": ["SW-EVAL-7"],
  "software-file-locator": ["SW-EVAL-7"],
  "cross-file-no-leak": ["SW-EVAL-7"],
  "pmc-pr-014-identifier": ["PMC/PR/014"],
  "equipment-system-report-cover-magnet": ["Required Testing Equipment"],
};

function goldForAblation(
  entry: RetrievalEvalCase,
  pages: readonly RetrievalCorpusPage[]
): RetrievalGoldHit[] {
  const extra = EXCERPT_NEEDLES[entry.id] ?? [];
  return entry.gold.map((hit) => {
    const declared = [...new Set([...(hit.mustContain ?? []), ...extra])];
    const applicable = declared.filter((needle) =>
      pages.some(
        (page) =>
          filenameMatches(page.filename, hit.filename) &&
          page.pageNumber === hit.page &&
          excerptContainsAny(page.text, [needle])
      )
    );
    return applicable.length > 0
      ? { filename: hit.filename, page: hit.page, mustContain: applicable }
      : { filename: hit.filename, page: hit.page };
  });
}

function scoreArm(
  hits: RankedFilenamePageText[],
  gold: readonly RetrievalGoldHit[],
  mustNotContainAnywhere: readonly string[] | undefined
): RetrievalAblationArm {
  const recall =
    gold.length > 0 ? recallAtK(hits, gold, RETRIEVAL_ABLATION_K) : null;
  const excerpt = excerptHitAtK(hits, gold, RETRIEVAL_ABLATION_K);
  const leak = noFalsePositiveAtK(
    hits,
    mustNotContainAnywhere,
    RETRIEVAL_ABLATION_K
  );
  const rightPage = gold.length === 0 ? leak !== 0 : recall === 1;
  const noLeak = leak === null ? null : leak === 1;
  const rightExcerpt = excerpt === null ? null : excerpt === 1;
  return {
    hits,
    rightPage,
    rightExcerpt,
    noLeak,
    correct:
      rightPage && rightExcerpt !== false && noLeak !== false,
  };
}

/** Prefix-900 excerpt, raw token rank, no identifier/locator/IDF/file cap. */
export function naiveRetrievalHits(
  pages: readonly RetrievalCorpusPage[],
  query: string,
  k = RETRIEVAL_ABLATION_K
): RankedFilenamePageText[] {
  return pages
    .map((page, index) => ({
      filename: page.filename,
      pageNumber: page.pageNumber,
      text: truncateSnippet(page.text, DEFAULT_SNIPPET_CHARS),
      index,
      score: lexicalMatchScore(page.text, query),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, k)
    .map(({ filename, pageNumber, text }) => ({
      filename,
      pageNumber,
      text,
    }));
}

/** Match-centered excerpt, IDF rerank, identifier/locator boost, file cap. */
export function andreiRetrievalHits(
  pages: readonly RetrievalCorpusPage[],
  query: string,
  k = RETRIEVAL_ABLATION_K
): RankedFilenamePageText[] {
  const ranked = takeRankedHits(
    pages.map((page) => ({
      filename: page.filename,
      pageNumber: page.pageNumber,
      text: page.text,
    })),
    query,
    k
  );
  return ranked.map((hit) => ({
    filename: hit.filename,
    pageNumber: hit.pageNumber,
    text: buildMatchCenteredSnippet(
      hit.text ?? "",
      query,
      DEFAULT_SNIPPET_CHARS
    ),
  }));
}

export function ablateRetrievalCases(input: {
  cases: readonly RetrievalEvalCase[];
  pages: readonly RetrievalCorpusPage[];
}): RetrievalAblationReport {
  const { cases, pages } = input;
  const rows: RetrievalAblationRow[] = cases.map((entry) => {
    const gold = goldForAblation(entry, pages);
    const on = scoreArm(
      andreiRetrievalHits(pages, entry.query),
      gold,
      entry.mustNotContainAnywhere
    );
    const off = scoreArm(
      naiveRetrievalHits(pages, entry.query),
      gold,
      entry.mustNotContainAnywhere
    );
    return {
      id: entry.id,
      kind: entry.kind,
      query: entry.query,
      passCriteria: entry.passCriteria,
      excerptApplicable: gold.some((hit) => (hit.mustContain?.length ?? 0) > 0),
      on,
      off,
    };
  });
  const excerptN = rows.filter((row) => row.excerptApplicable).length;
  const leakN = rows.filter((row) => row.on.noLeak !== null).length;
  return {
    benchVersion: ANDREI_BENCH_VERSION,
    n: rows.length,
    excerptN,
    leakN,
    rightPageOn: rows.filter((row) => row.on.rightPage).length,
    rightPageOff: rows.filter((row) => row.off.rightPage).length,
    rightExcerptOn: rows.filter((row) => row.on.rightExcerpt === true).length,
    rightExcerptOff: rows.filter((row) => row.off.rightExcerpt === true).length,
    noLeakOn: rows.filter((row) => row.on.noLeak === true).length,
    noLeakOff: rows.filter((row) => row.off.noLeak === true).length,
    correctOn: rows.filter((row) => row.on.correct).length,
    correctOff: rows.filter((row) => row.off.correct).length,
    rows,
  };
}

function mark(value: boolean | null): string {
  if (value === null) return "n/a";
  return value ? "yes" : "no";
}

export function formatRetrievalAblationReport(
  report: RetrievalAblationReport
): string {
  const lines = [
    `retrieval ablation  bench=${report.benchVersion}  n=${String(report.n)} (${String(report.excerptN)} with a row/ID to show)`,
    "",
    "id".padEnd(42) + "on page  on excerpt  off page  off excerpt",
    "-".repeat(88),
  ];
  for (const row of report.rows) {
    lines.push(
      `${row.id.padEnd(42)}${mark(row.on.rightPage).padEnd(9)}${mark(row.on.rightExcerpt).padEnd(12)}${mark(row.off.rightPage).padEnd(10)}${mark(row.off.rightExcerpt)}`
    );
  }
  lines.push("-".repeat(88));
  lines.push(
    `right page + excerpt  Andrei on ${String(report.correctOn)}/${String(report.n)}   Andrei off ${String(report.correctOff)}/${String(report.n)}`
  );
  lines.push(
    `right page            Andrei on ${String(report.rightPageOn)}/${String(report.n)}   Andrei off ${String(report.rightPageOff)}/${String(report.n)}`
  );
  lines.push(
    `right excerpt         Andrei on ${String(report.rightExcerptOn)}/${String(report.excerptN)}   Andrei off ${String(report.rightExcerptOff)}/${String(report.excerptN)}`
  );
  lines.push(
    "Wrong page never gets to persist — that is the save check on the persist slide. This eval is whether search opened the page and showed the row, not the header."
  );
  return lines.join("\n");
}
