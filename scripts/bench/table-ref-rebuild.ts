/**
 * Time `liveTableRefNumbers` / `documentContentsFromReportState` offline.
 *
 * Synthetic ELR (default):
 *   pnpm bench:table-ref
 *   pnpm bench:table-ref -- --open-suggestions 12 --iterations 10
 *
 * Live report from Postgres:
 *   pnpm bench:table-ref -- --report-id <cuid>
 *
 * CI budget (exit 1 if p95 exceeds ms):
 *   BENCH_TABLE_REF_BUDGET_MS=800 pnpm bench:table-ref -- --json
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { DocumentType } from "@/db/schema";
import { mergeSectionForType, getDocumentType } from "@/lib/document-types";
import { parseAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import {
  documentContentsFromReportState,
  liveTableRefNumbers,
  orderedSectionContents,
  type TableNumberComment,
} from "@/lib/suggestions/document-table-number";
import {
  listInsertableTableRefs,
  tableRefNumberMap,
} from "@/lib/suggestions/table-ref";
import {
  openInsertRowsComments,
  syntheticElrSections,
} from "./fixtures/elr-scaling";

loadEnv({ path: path.join(process.cwd(), ".env") });
loadEnv({ path: path.join(process.cwd(), ".env.local"), override: true });

const DOCUMENT_TYPE: DocumentType = "equipment_lifecycle_report";

type BenchArgs = {
  reportId: string | null;
  openSuggestions: number;
  iterations: number;
  json: boolean;
  sweep: number[];
};

function parseArgs(argv: string[]): BenchArgs {
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  let reportId: string | null = null;
  let openSuggestions = 0;
  let iterations = 5;
  let json = false;
  const sweep: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a === "--report-id") reportId = tokens[++i] ?? null;
    else if (a === "--open-suggestions") openSuggestions = Number(tokens[++i] ?? 0);
    else if (a === "--iterations") iterations = Number(tokens[++i] ?? 5);
    else if (a === "--json") json = true;
    else if (a === "--sweep") {
      const raw = tokens[++i] ?? "";
      sweep.push(...raw.split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n)));
    } else if (a === "--help" || a === "-h") {
      console.log(`usage:
  pnpm bench:table-ref [--open-suggestions N] [--iterations N] [--sweep 0,6,12,24]
  pnpm bench:table-ref --report-id <id> [--iterations N]
  BENCH_TABLE_REF_BUDGET_MS=<ms> pnpm bench:table-ref --json`);
      process.exit(0);
    }
  }

  return { reportId, openSuggestions, iterations, json, sweep };
}

function timeSync<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    p50: p(0.5),
    p95: p(0.95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function countOpenTableSuggestions(comments: readonly TableNumberComment[]): number {
  return comments.filter((c) => {
    if (c.status !== "open" || c.kind !== "ai_fix") return false;
    const op = parseAiFixCommentContent(c.content).tableOperation;
    return Boolean(op);
  }).length;
}

async function loadSectionsFromReport(reportId: string) {
  const { loadReportAuth, loadReportSubtables } = await import("@/lib/reports/bundle");
  const report = await loadReportAuth(reportId);
  if (!report) throw new Error(`report not found: ${reportId}`);
  const sub = await loadReportSubtables(reportId);
  const def = getDocumentType(report.documentType);
  const sections: Record<string, unknown> = {};
  for (const section of def.sections.filter((s) => !s.virtual)) {
    const row = sub.sections.find((r) => r.section === section.key);
    sections[section.key] = row
      ? mergeSectionForType(report.documentType, section.key, row.content)
      : section.emptyContent;
  }
  const comments: TableNumberComment[] = sub.comments.map((c) => ({
    id: c.id,
    section: c.section,
    content: c.content,
    contentPath: c.contentPath,
    status: c.status,
    kind: c.kind,
    createdAt:
      c.createdAt instanceof Date
        ? c.createdAt.toISOString()
        : String(c.createdAt),
  }));

  return {
    documentType: report.documentType,
    sections,
    comments,
  };
}

type PhaseResult = {
  orderedMs: number;
  overlayMs: number;
  mapMs: number;
  insertableMs: number;
  liveMs: number;
  mapSize: number;
  insertableCount: number;
  openTableSuggestions: number;
  sectionCount: number;
};

function benchOnce(args: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
  comments: readonly TableNumberComment[];
}): PhaseResult {
  const ordered = timeSync(() =>
    orderedSectionContents({
      documentType: args.documentType,
      sections: args.sections,
    })
  );

  const overlay = timeSync(() =>
    documentContentsFromReportState({
      documentType: args.documentType,
      sections: args.sections,
      comments: args.comments,
    })
  );

  const map = timeSync(() => tableRefNumberMap(overlay.value));
  const insertable = timeSync(() => listInsertableTableRefs(overlay.value));

  const live = timeSync(() =>
    liveTableRefNumbers({
      documentType: args.documentType,
      sections: args.sections,
      comments: args.comments,
    })
  );

  return {
    orderedMs: ordered.ms,
    overlayMs: overlay.ms,
    mapMs: map.ms,
    insertableMs: insertable.ms,
    liveMs: live.ms,
    mapSize: map.value.size,
    insertableCount: insertable.value.length,
    openTableSuggestions: countOpenTableSuggestions(args.comments),
    sectionCount: ordered.value.length,
  };
}

function runIterations(
  label: string,
  args: {
    documentType: DocumentType;
    sections: Readonly<Partial<Record<string, unknown>>>;
    comments: readonly TableNumberComment[];
  },
  iterations: number
) {
  const liveSamples: number[] = [];
  let last: PhaseResult | null = null;

  for (let i = 0; i < iterations; i++) {
    last = benchOnce(args);
    liveSamples.push(last.liveMs);
  }

  const liveStats = stats(liveSamples);
  return { label, last, liveStats };
}

function printHuman(result: ReturnType<typeof runIterations>) {
  const { last, liveStats, label } = result;
  if (!last) return;
  console.log(`\n=== ${label} ===`);
  console.log(
    `sections=${last.sectionCount}  openTableSuggestions=${last.openTableSuggestions}  map=${last.mapSize}  insertable=${last.insertableCount}`
  );
  console.log(
    `last run (ms): ordered=${last.orderedMs.toFixed(2)}  overlay=${last.overlayMs.toFixed(2)}  map=${last.mapMs.toFixed(2)}  insertable=${last.insertableMs.toFixed(2)}  live=${last.liveMs.toFixed(2)}`
  );
  console.log(
    `liveTableRefNumbers over ${liveStats.n} runs: min=${liveStats.min.toFixed(2)} p50=${liveStats.p50.toFixed(2)} p95=${liveStats.p95.toFixed(2)} max=${liveStats.max.toFixed(2)} ms`
  );
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const budgetMs = Number(process.env.BENCH_TABLE_REF_BUDGET_MS ?? 0);

  const results: Array<{
    label: string;
    liveStats: ReturnType<typeof stats>;
    last: PhaseResult | null;
  }> = [];

  if (cli.sweep.length > 0) {
    for (const n of cli.sweep) {
      const sections = syntheticElrSections();
      const comments = openInsertRowsComments(n);
      results.push(
        runIterations(
          `synthetic ELR openSuggestions=${n}`,
          { documentType: DOCUMENT_TYPE, sections, comments },
          cli.iterations
        )
      );
    }
  } else if (cli.reportId) {
    const loaded = await loadSectionsFromReport(cli.reportId);
    results.push(
      runIterations(
        `report ${cli.reportId} (${loaded.documentType})`,
        loaded,
        cli.iterations
      )
    );
  } else {
    const sections = syntheticElrSections();
    const comments = openInsertRowsComments(cli.openSuggestions);
    results.push(
      runIterations(
        `synthetic ELR openSuggestions=${cli.openSuggestions}`,
        { documentType: DOCUMENT_TYPE, sections, comments },
        cli.iterations
      )
    );
  }

  if (cli.json) {
    console.log(JSON.stringify({ budgetMs, results }, null, 2));
  } else {
    for (const r of results) printHuman(r);
  }

  if (budgetMs > 0) {
    const worst = Math.max(...results.map((r) => r.liveStats.p95));
    if (worst > budgetMs) {
      console.error(`BENCH_TABLE_REF_BUDGET_MS exceeded: p95 ${worst.toFixed(2)} > ${budgetMs}`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
