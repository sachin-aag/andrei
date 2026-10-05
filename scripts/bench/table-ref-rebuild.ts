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
 *
 * Per-section keystroke simulation (throws + slow live rebuilds):
 *   pnpm bench:table-ref -- --report-id <id> --stress
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
if (process.env.BENCH_USE_LOCAL_DB === "1") {
  loadEnv({ path: path.join(process.cwd(), ".env.local"), override: true });
}

const DOCUMENT_TYPE: DocumentType = "equipment_lifecycle_report";

type BenchArgs = {
  reportId: string | null;
  openSuggestions: number;
  iterations: number;
  json: boolean;
  sweep: number[];
  stress: boolean;
};

function parseArgs(argv: string[]): BenchArgs {
  const tokens = argv[0] === "--" ? argv.slice(1) : argv;
  let reportId: string | null = null;
  let openSuggestions = 0;
  let iterations = 5;
  let json = false;
  let stress = false;
  const sweep: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a === "--report-id") reportId = tokens[++i] ?? null;
    else if (a === "--open-suggestions") openSuggestions = Number(tokens[++i] ?? 0);
    else if (a === "--iterations") iterations = Number(tokens[++i] ?? 5);
    else if (a === "--json") json = true;
    else if (a === "--stress") stress = true;
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

  return { reportId, openSuggestions, iterations, json, sweep, stress };
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

const STRESS_SLOW_MS = Number(process.env.BENCH_STRESS_SLOW_MS ?? 50);

type StressRow = {
  section: string;
  liveMs: number;
  overlayMs: number;
  error?: string;
};

function stressReportKeystrokes(loaded: {
  documentType: DocumentType;
  sections: Readonly<Partial<Record<string, unknown>>>;
  comments: readonly TableNumberComment[];
}): { rows: StressRow[]; baseline: PhaseResult } {
  const baseline = benchOnce(loaded);
  const keys = Object.keys(loaded.sections);
  const rows: StressRow[] = [];

  for (const sectionKey of keys) {
    const current = loaded.sections[sectionKey];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      rows.push({ section: sectionKey, liveMs: 0, overlayMs: 0, error: "skip: non-object section" });
      continue;
    }
    const edited = {
      ...loaded.sections,
      [sectionKey]: { ...(current as Record<string, unknown>) },
    };
    try {
      const overlay = timeSync(() =>
        documentContentsFromReportState({
          documentType: loaded.documentType,
          sections: edited,
          comments: loaded.comments,
        })
      );
      const live = timeSync(() =>
        liveTableRefNumbers({
          documentType: loaded.documentType,
          sections: edited,
          comments: loaded.comments,
        })
      );
      rows.push({ section: sectionKey, liveMs: live.ms, overlayMs: overlay.ms });
    } catch (e) {
      rows.push({
        section: sectionKey,
        liveMs: 0,
        overlayMs: 0,
        error: (e as Error).message,
      });
    }
  }

  return { rows, baseline };
}

function printStressReport(
  reportId: string,
  loaded: {
    documentType: DocumentType;
    comments: readonly TableNumberComment[];
  },
  stress: ReturnType<typeof stressReportKeystrokes>
) {
  const { rows, baseline } = stress;
  const errors = rows.filter((r) => r.error);
  const slow = rows.filter((r) => !r.error && r.liveMs >= STRESS_SLOW_MS);
  const worst = [...rows].filter((r) => !r.error).sort((a, b) => b.liveMs - a.liveMs).slice(0, 8);

  console.log(`\n=== stress report ${reportId} (${loaded.documentType}) ===`);
  console.log(
    `comments=${loaded.comments.length}  openTableSuggestions=${countOpenTableSuggestions(loaded.comments)}  slowThresholdMs=${STRESS_SLOW_MS}`
  );
  console.log(
    `baseline live=${baseline.liveMs.toFixed(2)}ms overlay=${baseline.overlayMs.toFixed(2)}ms`
  );
  console.log(`per-section keystroke sim: ${rows.length} sections  errors=${errors.length}  slow=${slow.length}`);

  if (errors.length > 0) {
    console.log("\nERRORS (would not crash Node unless uncaught in React — still a data bug):");
    for (const r of errors) console.log(`  ${r.section}: ${r.error}`);
  }
  if (worst.length > 0) {
    console.log("\nSlowest sections (liveTableRefNumbers after shallow clone):");
    for (const r of worst) {
      console.log(`  ${r.liveMs.toFixed(2)}ms live  ${r.overlayMs.toFixed(2)}ms overlay  ${r.section}`);
    }
  }
  if (errors.length === 0 && slow.length === 0) {
    console.log("\nNo throws and no section exceeded slow threshold — table-ref path is unlikely to explain a browser tab crash on this report.");
  }
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
    if (cli.stress) {
      const stress = stressReportKeystrokes(loaded);
      if (cli.json) {
        console.log(JSON.stringify({ reportId: cli.reportId, stress }, null, 2));
      } else {
        printStressReport(cli.reportId, loaded, stress);
      }
      const errors = stress.rows.filter((r) => r.error);
      const slow = stress.rows.filter((r) => !r.error && r.liveMs >= STRESS_SLOW_MS);
      if (errors.length > 0 || slow.length > 0) process.exit(1);
      return;
    }
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
