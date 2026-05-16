/**
 * Bulk-evaluates DOCX deviation reports (sample files) using the same AI pipeline as
 * /api/reports/[reportId]/evaluate, then emits a single HTML report with per-report
 * detail and aggregate traffic-light tables.
 *
 * Cost: ~(number of DOCX × 5) sectional Gemini calls plus one clustering call.
 *
 *   npm run sample-eval-report
 *   npx tsx scripts/bulk-sample-evaluation-report.ts --input-dir docs/sample_files --out docs/sample_evaluation_report.html
 *   npx tsx scripts/bulk-sample-evaluation-report.ts --concurrency 4
 */

import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import type { SectionType } from "@/db/schema";
import {
  evaluateSection,
  resolveEvaluationLanguageModel,
} from "@/lib/ai/evaluate";
import {
  normalizeAnalyzeToolResults,
  normalizePromptText,
} from "@/lib/ai/evaluate-run-helpers";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { contextForPrompt } from "@/lib/ai/section-context";
import { hasEnoughContextInFirstSection } from "@/lib/ai/first-section-context";
import {
  aggregateCriterionOverall,
  allEvaluatableCriterionEntries,
  criterionLabelLookup,
  dedupeReasoningsNonMet,
  escapeHtml,
  truncateOneLine,
  type BulkEvalRow,
} from "@/lib/sample-eval/bulk-eval-aggregates";
import { classifyDedupedReasoningsWithLLM } from "@/lib/sample-eval/cluster-non-met-reasonings";

type ReportRunOutcome = {
  sourcePath: string;
  sourceFile: string;
  deviationNo: string;
  anchorSlug: string;
  skippedReason: string | null;
  rows: BulkEvalRow[];
};

function parseArgs(argv: string[]) {
  let inputDir = path.join(process.cwd(), "docs", "sample_files");
  let outFile = path.join(process.cwd(), "docs", "sample_evaluation_report.html");
  /** How many DOCX files to evaluate concurrently (each file still evaluates its 5 DMAIC sections in parallel). */
  let docConcurrency = 4;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-dir" && argv[i + 1]) {
      inputDir = path.resolve(argv[++i]);
    } else if (a === "--out" && argv[i + 1]) {
      outFile = path.resolve(argv[++i]);
    } else if ((a === "--concurrency" || a === "-j") && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 1) {
        console.error(`${a} expects a positive integer`);
        process.exit(1);
      }
      docConcurrency = Math.floor(n);
    }
  }
  return { inputDir, outFile, docConcurrency };
}

/**
 * Run tasks with at most `limit` in flight; results preserve `items` order.
 */
async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const cap = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runNext(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const poolSize = Math.min(cap, items.length);
  await Promise.all(Array.from({ length: poolSize }, () => runNext()));
  return results;
}

/** Collect *.docx under dir (recursive depth-first). */
function collectDocxFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && /\.docx$/i.test(e.name)) out.push(full);
    }
  }
  return out.sort();
}

function reportAnchorSlug(basenameNoExt: string): string {
  const base =
    basenameNoExt
      .replace(/\.docx$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "report";
  return `report-${base.toLowerCase()}`;
}

function deviationNoFromBasename(originalName: string): string {
  return (
    originalName.replace(/\.docx$/i, "").replace(/_/g, " ").trim() ||
    originalName
  );
}

function buildPreviousSections(
  sections: ImportedReportContent["sections"],
  current: SectionType
): Array<{ section: SectionType; content: string }> {
  const idx = EVALUATABLE_SECTIONS.indexOf(current);
  const priorKeys = EVALUATABLE_SECTIONS.slice(0, Math.max(0, idx));
  return priorKeys
    .map((sectionKey) => {
      const payload =
        sections[sectionKey as keyof ImportedReportContent["sections"]];
      const raw = contextForPrompt(sectionKey, payload);
      if (!raw || raw.trim() === "" || raw.trim() === "{}") return null;
      return { section: sectionKey, content: normalizePromptText(raw) };
    })
    .filter((x): x is { section: SectionType; content: string } => x !== null);
}

async function evaluateOneDocx(absPath: string): Promise<ReportRunOutcome> {
  const buf = fs.readFileSync(absPath);
  const sourceFile = path.basename(absPath);
  const anchorSlug = reportAnchorSlug(path.basename(absPath, ".docx"));

  let imported: ImportedReportContent;
  try {
    imported = await docxBufferToImportedReportContent(buf);
  } catch (e) {
    return {
      sourcePath: absPath,
      sourceFile,
      deviationNo: deviationNoFromBasename(sourceFile),
      anchorSlug,
      skippedReason: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
      rows: [],
    };
  }

  const deviationNo = deviationNoFromBasename(sourceFile);

  if (!hasEnoughContextInFirstSection(imported.sections.define)) {
    return {
      sourcePath: absPath,
      sourceFile,
      deviationNo,
      anchorSlug,
      skippedReason:
        "Define section lacks enough sentences to evaluate (needs at least two).",
      rows: [],
    };
  }

  const reportDate = new Date();

  const sectionResults = await Promise.all(
    EVALUATABLE_SECTIONS.map(async (sectionKey) => {
      const payload =
        imported.sections[sectionKey as keyof typeof imported.sections];

      let evaluations = await evaluateSection({
        section: sectionKey,
        content: payload,
        reportContext: { deviationNo, date: reportDate },
        previousSections: buildPreviousSections(imported.sections, sectionKey),
      });

      if (sectionKey === "analyze") {
        evaluations = normalizeAnalyzeToolResults(payload as unknown, evaluations);
      }

      const rowsChunk: BulkEvalRow[] = evaluations.map((ev) => ({
        sourceFile,
        deviationNo,
        section: sectionKey,
        criterionKey: ev.criterionKey,
        criterionLabel: ev.criterionLabel,
        status: ev.status,
        reasoning: ev.reasoning,
      }));
      return rowsChunk;
    })
  );

  return {
    sourcePath: absPath,
    sourceFile,
    deviationNo,
    anchorSlug,
    skippedReason: null,
    rows: sectionResults.flat(),
  };
}

function statusBadgeClass(status: BulkEvalRow["status"]): string {
  switch (status) {
    case "met":
      return "ok";
    case "partially_met":
      return "partial";
    case "not_met":
      return "fail";
    default:
      return "muted";
  }
}

function statusPriority(status: BulkEvalRow["status"]): number {
  switch (status) {
    case "not_met":
      return 0;
    case "partially_met":
      return 1;
    case "not_evaluated":
      return 2;
    case "met":
      return 3;
  }
}

function htmlReport(params: {
  runs: ReportRunOutcome[];
  allRows: BulkEvalRow[];
  specificPatternRows: Awaited<
    ReturnType<typeof classifyDedupedReasoningsWithLLM>
  >["specificRows"];
  genericPatternRows: Awaited<
    ReturnType<typeof classifyDedupedReasoningsWithLLM>
  >["genericRows"];
  clusteringNote: string;
}): string {
  const criterionLabels = criterionLabelLookup();
  const criterionOrder = allEvaluatableCriterionEntries();

  const overall = aggregateCriterionOverall(params.allRows);

  const toc = params.runs
    .map((r) => {
      const label = `${r.deviationNo} (${r.sourceFile})`;
      const extra = r.skippedReason
        ? " — skipped"
        : ` — ${r.rows.length} evaluations`;
      return `<li><a href="#${escapeHtml(r.anchorSlug)}">${escapeHtml(label)}</a>${escapeHtml(extra)}</li>`;
    })
    .join("\n");

  const reportSectionsHtml = params.runs
    .map((run) => {
      if (run.skippedReason) {
        return `
<section id="${escapeHtml(run.anchorSlug)}" class="report-card">
<h2>${escapeHtml(run.deviationNo)}</h2>
<p class="meta">${escapeHtml(run.sourceFile)}</p>
<p class="warn">${escapeHtml(run.skippedReason)}</p>
</section>`;
      }

      const counts = {
        met: 0,
        partially_met: 0,
        not_met: 0,
        not_evaluated: 0,
      };
      for (const row of run.rows) counts[row.status] += 1;

      const totalRows = run.rows.length || 1;
      const passRate = Math.round((counts.met / totalRows) * 100);
      const issueRows = run.rows
        .filter((row) => row.status !== "met")
        .sort((a, b) => statusPriority(a.status) - statusPriority(b.status));

      const topIssuesHtml =
        issueRows.length === 0
          ? `<p class="compact-ok">No amber/red/not-evaluated criteria.</p>`
          : `<ol class="issue-list">${issueRows
              .slice(0, 6)
              .map(
                (row) => `<li>
<span class="badge ${statusBadgeClass(row.status)}">${escapeHtml(row.status.replace(/_/g, " "))}</span>
<strong>${escapeHtml(row.section.toUpperCase())}</strong>
<span>${escapeHtml(row.criterionLabel)}</span>
<small>${escapeHtml(truncateOneLine(row.reasoning, 220))}</small>
</li>`
              )
              .join("")}</ol>`;

      const detailRows = run.rows
        .map(
          (row) => `<tr>
<td>${escapeHtml(row.section.toUpperCase())}</td>
<td><span class="badge ${statusBadgeClass(row.status)}">${escapeHtml(row.status.replace(/_/g, " "))}</span></td>
<td><strong>${escapeHtml(row.criterionKey)}</strong><br/><span class="muted">${escapeHtml(row.criterionLabel)}</span></td>
<td>${escapeHtml(truncateOneLine(row.reasoning, 260))}</td>
</tr>`
        )
        .join("\n");

      return `
<section id="${escapeHtml(run.anchorSlug)}" class="report-card">
<div class="report-head">
  <div>
    <h2>${escapeHtml(run.deviationNo)}</h2>
    <p class="meta">Source file: ${escapeHtml(run.sourceFile)}</p>
  </div>
  <div class="score-big">${passRate}%<span>met</span></div>
</div>
<div class="score-grid">
  <div><strong>${counts.met}</strong><span>Met</span></div>
  <div><strong>${counts.partially_met}</strong><span>Partial</span></div>
  <div><strong>${counts.not_met}</strong><span>Not met</span></div>
  <div><strong>${counts.not_evaluated}</strong><span>Not eval</span></div>
  <div><strong>${issueRows.length}</strong><span>Follow-ups</span></div>
</div>
<h3>Top follow-ups</h3>
${topIssuesHtml}
<details open>
<summary>All scores and reasonings (${run.rows.length})</summary>
<table class="compact-table">
<thead><tr><th>Section</th><th>Status</th><th>Criterion</th><th>Reasoning</th></tr></thead>
<tbody>${detailRows}</tbody>
</table>
</details>
</section>`;
    })
    .join('\n<hr class="sep"/>\n');

  const overviewRows = criterionOrder.map((def) => {
    const oc = overall.get(def.key) ?? {
      met: 0,
      partially_met: 0,
      not_met: 0,
      not_evaluated: 0,
    };
    return `<tr>
<td>${escapeHtml(def.key)}</td>
<td>${escapeHtml(truncateOneLine(def.label, 140))}</td>
<td>${oc.met}</td>
<td>${oc.partially_met}</td>
<td>${oc.not_met}</td>
<td>${oc.not_evaluated}</td>
</tr>`;
  });

  const renderPatternRows = (
    rows: typeof params.specificPatternRows,
    emptyLabel: string
  ) => {
    const html = rows
      .map((pr) => {
        const ck = pr.topCriterionKeys
          .map((k) => `${k} (${criterionLabels.get(k) ?? k})`)
          .join("; ");
        return `<tr><td>${escapeHtml(pr.patternLabel)}</td><td>${pr.occurrences}</td><td>${escapeHtml(ck)}</td><td>${escapeHtml(truncateOneLine(pr.exampleReasoning, 220))}</td></tr>`;
      })
      .join("\n");
    return html || `<tr><td colspan="4">${escapeHtml(emptyLabel)}</td></tr>`;
  };

  const specificPatternRowsHtml = renderPatternRows(
    params.specificPatternRows,
    "No specific issue buckets assigned."
  );
  const genericPatternRowsHtml = renderPatternRows(
    params.genericPatternRows,
    "No generic issue buckets assigned."
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Bulk deviation evaluation (${params.runs.length} reports)</title>
<style>
 :root {
   --green: #166534;
   --amber: #a16207;
   --red: #b91c1c;
   --muted: #6b7280;
   --border: #e5e7eb;
   --surface: #f9fafb;
 }
 html { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.35; background:#fafafa;color:#171717;}
 body { max-width: 1100px; margin:24px auto; padding:16px;}
 h1,h2,h3{margin:16px 0 8px;}
 .meta{font-size:.9rem;color:var(--muted);}
 .muted{color:var(--muted);font-size:.85rem;word-break:break-all;}
 table { border-collapse: collapse; font-size:.85rem; width:100%; margin:16px 0;background:#fff;}
 th, td { border:1px solid var(--border); padding:6px 8px;text-align:left; vertical-align: top;}
 thead th{background:var(--surface);}
 .report-card{border:1px solid var(--border);border-radius:8px;background:#fff;padding:16px 20px;margin:20px 0;}
 .warn{color:var(--red);font-weight:600;}
 .report-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:10px;}
 .report-head h2{margin:0 0 4px;}
 .score-big{min-width:72px;text-align:center;font-weight:800;font-size:1.7rem;color:var(--green);}
 .score-big span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
 .score-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:10px 0 12px;}
 .score-grid div{border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--surface);}
 .score-grid strong{display:block;font-size:1.1rem;}
 .score-grid span{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
 .issue-list{margin:8px 0 12px;padding-left:20px;}
 .issue-list li{margin:5px 0;font-size:.9rem;}
 .issue-list small{display:block;color:#374151;margin-top:2px;}
 .compact-ok{color:var(--green);font-weight:600;}
 summary{cursor:pointer;font-weight:700;margin:10px 0;}
 .compact-table{font-size:.78rem;margin-top:8px;}
 .compact-table th,.compact-table td{padding:5px 6px;}
 .compact-table td:nth-child(1){width:72px;}
 .compact-table td:nth-child(2){width:96px;}
 .badge{display:inline-block;border-radius:999px;padding:2px 7px;color:#fff;font-size:.68rem;font-weight:700;white-space:nowrap;}
 .badge.ok{background:var(--green);}
 .badge.partial{background:var(--amber);}
 .badge.fail{background:var(--red);}
 .badge.muted{background:#4b5563;}
 .sep{border:none;border-top:1px solid var(--border);margin:36px 0;}
 .pill{display:inline-flex;gap:8px;margin:12px 0;}
 .pill span{padding:4px 8px;border-radius:999px;font-size:.75rem;font-weight:600;color:#fff;}
 .pill-green{background:var(--green);}
 .pill-amber{background:var(--amber);}
 .pill-red{background:var(--red);}
 .pill-muted{background:#4b5563;}
 @media print {
   body{max-width:none;margin:0;padding:0;font-size:10px;}
   .report-card{page-break-after:always;margin:0 0 10px;padding:10px;border:none;}
   .sep{display:none;}
   .compact-table{font-size:9px;}
   h1,.pill,body > h2:first-of-type,body > ul:first-of-type{display:none;}
 }
</style>
</head>
<body>
<h1>Bulk deviation traffic-light evaluation</h1>
<p class="muted">Generated ${new Date().toISOString()} — ${escapeHtml(params.clusteringNote)}</p>

<div class="pill">
<span class="pill-green">Green = met</span>
<span class="pill-amber">Amber = partially met</span>
<span class="pill-red">Red = not met</span>
<span class="pill-muted">Gray = not evaluated</span>
</div>

<h2>Table of contents</h2>
<ul>${toc}</ul>

<hr class="sep"/>

<h2>Per-report evaluations</h2>
${reportSectionsHtml}

<hr class="sep"/>

<h2>Aggregate: traffic light totals per criterion</h2>
<p class="muted">Columns: met (green), partially met (amber), not met (red), not evaluated (?).</p>
<table>
<thead><tr><th>Criterion key</th><th>Label</th><th>Met</th><th>Partial</th><th>Not met</th><th>Not eval</th></tr></thead>
<tbody>${overviewRows.join("\n")}</tbody></table>

<h2>Specific issue buckets (non-met statuses)</h2>
<p class="muted">${escapeHtml(params.clusteringNote)}</p>
<table>
<thead><tr><th>Pattern</th><th>Occurrences</th><th>Top criteria keys</th><th>Example reasoning</th></tr></thead>
<tbody>${specificPatternRowsHtml}</tbody>
</table>

<h2>Generic follow-up themes</h2>
<p class="muted">A separate broader classification layer; reasonings may appear in multiple themes or none.</p>
<table>
<thead><tr><th>Theme</th><th>Occurrences</th><th>Top criteria keys</th><th>Example reasoning</th></tr></thead>
<tbody>${genericPatternRowsHtml}</tbody>
</table>

</body>
</html>`;
}

async function main() {
  const { inputDir, outFile, docConcurrency } = parseArgs(process.argv.slice(2));
  console.error(`Scanning DOCX inputs in: ${inputDir}`);
  console.error(`Concurrent documents: ${docConcurrency}`);
  const files = collectDocxFiles(inputDir);
  if (files.length === 0) {
    console.error(
      `No .docx files found under ${inputDir}. Add samples or pass --input-dir.`
    );
    process.exit(1);
  }

  const runs = await mapWithConcurrencyLimit(files, docConcurrency, async (f, i) => {
    console.error(`[${i + 1}/${files.length}] Evaluating: ${path.basename(f)} …`);
    const run = await evaluateOneDocx(f);
    if (run.skippedReason) {
      console.error(`  ├─ ${path.basename(f)} skipped: ${run.skippedReason}`);
    } else {
      console.error(`  ├─ ${path.basename(f)} OK — ${run.rows.length} criterion rows`);
    }
    return run;
  });

  const allRows = runs.flatMap((r) => r.rows);
  const deduped = dedupeReasoningsNonMet(allRows);
  let clusteringNote: string;
  let specificPatternRows: Awaited<
    ReturnType<typeof classifyDedupedReasoningsWithLLM>
  >["specificRows"] = [];
  let genericPatternRows: Awaited<
    ReturnType<typeof classifyDedupedReasoningsWithLLM>
  >["genericRows"] = [];

  if (deduped.length === 0) {
    clusteringNote =
      "No partial, not met, or not evaluated reasonings included in clustering.";
  } else {
    const model = resolveEvaluationLanguageModel();
    const classifications = await classifyDedupedReasoningsWithLLM({
      model,
      deduped,
    });
    specificPatternRows = classifications.specificRows;
    genericPatternRows = classifications.genericRows;
    clusteringNote =
      classifications.usedSpecificFallback || classifications.usedGenericFallback
        ? "Issue buckets: structured multi-label classification with heuristic fallback for one or more layers."
        : "Issue buckets: structured multi-label classification; reasonings may be in multiple buckets or none.";
  }

  const html = htmlReport({
    runs,
    allRows,
    specificPatternRows,
    genericPatternRows,
    clusteringNote,
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  console.error(`Wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
