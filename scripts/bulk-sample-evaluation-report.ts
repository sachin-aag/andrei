/**
 * Bulk-evaluates DOCX deviation reports (sample files) using the same AI pipeline as
 * /api/reports/[reportId]/evaluate, then emits a single HTML report with per-report
 * detail and aggregate traffic-light tables.
 *
 * Cost: ~(number of DOCX × 5) sectional Gemini calls plus one clustering call.
 *
 *   npm run sample-eval-report
 *   Default output naming: docs/sample_evaluation_report_YYYY-MM-DD_HHmmss.html (override with --out)
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
  PROMPT_VERSION,
  describeCriterionEvaluationLlmFootprint,
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
import {
  classifyDedupedReasoningsWithLLM,
  REASONING_BUCKET_LAYER_LLM,
} from "@/lib/sample-eval/cluster-non-met-reasonings";

type HtmlRunMeta = {
  outputPath: string;
  generatedAtIso: string;
  generatedAtLocal: string;
  promptVersion: string;
  criterionLlm: ReturnType<typeof describeCriterionEvaluationLlmFootprint>;
  bucketLlm: typeof REASONING_BUCKET_LAYER_LLM;
  clusteringNote: string;
};

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
  let outOverride: string | undefined;
  /** How many DOCX files to evaluate concurrently (each file still evaluates its 5 DMAIC sections in parallel). */
  let docConcurrency = 4;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input-dir" && argv[i + 1]) {
      inputDir = path.resolve(argv[++i]);
    } else if (a === "--out" && argv[i + 1]) {
      outOverride = path.resolve(argv[++i]);
    } else if ((a === "--concurrency" || a === "-j") && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 1) {
        console.error(`${a} expects a positive integer`);
        process.exit(1);
      }
      docConcurrency = Math.floor(n);
    }
  }
  return { inputDir, outOverride, docConcurrency };
}

/** Default docs/sample_evaluation_report_YYYY-MM-DD_HHmmss.html (local clock). */
function defaultTimestampedReportFile(cwd: string): string {
  const n = new Date();
  const yyyy = n.getFullYear();
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const dd = String(n.getDate()).padStart(2, "0");
  const hh = String(n.getHours()).padStart(2, "0");
  const mi = String(n.getMinutes()).padStart(2, "0");
  const ss = String(n.getSeconds()).padStart(2, "0");
  return path.join(
    cwd,
    "docs",
    `sample_evaluation_report_${yyyy}-${mm}-${dd}_${hh}${mi}${ss}.html`
  );
}

function renderRunMetaTable(meta: HtmlRunMeta): string {
  const { criterionLlm, bucketLlm } = meta;
  const rows: [string, string][] = [
    ["Output path", escapeHtml(meta.outputPath)],
    ["Generated at (ISO-8601)", escapeHtml(meta.generatedAtIso)],
    ["Generated at (local)", escapeHtml(meta.generatedAtLocal)],
    ["Evaluation prompt version", escapeHtml(meta.promptVersion)],
    ["Criterion evaluator model ID", escapeHtml(criterionLlm.criterionModelId)],
    ["Criterion evaluator stack", escapeHtml(criterionLlm.criterionProvider)],
    ["Criterion evaluator temperature", escapeHtml(String(criterionLlm.criterionTemperature))],
    ["Criterion structured output", escapeHtml(criterionLlm.criterionStructuredOutput)],
    ["Higher thinking-budget sections", escapeHtml(criterionLlm.criterionHeavySectionList)],
    ["Light section generation tuning", escapeHtml(criterionLlm.criterionLightSectionsConfig)],
    ["Heavy section generation tuning", escapeHtml(criterionLlm.criterionHeavySectionsConfig)],
    ["Reasoning-bucket model", escapeHtml(bucketLlm.modelId)],
    ["Reasoning-bucket stack", escapeHtml(bucketLlm.provider)],
    ["Reasoning-bucket passes", escapeHtml(String(bucketLlm.passes))],
    ["Reasoning-bucket labels", escapeHtml(bucketLlm.passLabels)],
    ["Reasoning-bucket temperature", escapeHtml(String(bucketLlm.temperature))],
    ["Reasoning-bucket max output tokens", escapeHtml(String(bucketLlm.maxOutputTokens))],
    ["Reasoning-bucket schema", escapeHtml(bucketLlm.schemaDescription)],
    ["Reasoning-layer processing note", escapeHtml(meta.clusteringNote)],
  ];
  return rows
    .map(
      ([label, htmlVal]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${htmlVal}</td></tr>`
    )
    .join("\n");
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

function reportTocSubtitle(run: ReportRunOutcome): string {
  if (run.skippedReason) return "skipped";
  return `${run.rows.length} evaluations`;
}

/** Nested &lt;ol&gt; listing each report anchor (inside “Per-report” parent). */
function renderReportNavSubtree(runs: readonly ReportRunOutcome[]): string {
  if (runs.length === 0) {
    return "<ol><li>No reports</li></ol>";
  }
  return `<ol class="toc-sub">
${runs
  .map((r) => {
    const label = `${r.deviationNo} (${r.sourceFile})`;
    const suffix = reportTocSubtitle(r);
    return `  <li><a href="#${escapeHtml(r.anchorSlug)}">${escapeHtml(label)}</a><span class="toc-suffix">${escapeHtml(suffix)}</span></li>`;
  })
  .join("\n")}
</ol>`;
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
  runMeta: HtmlRunMeta;
}): string {
  const criterionLabels = criterionLabelLookup();
  const criterionOrder = allEvaluatableCriterionEntries();

  const overall = aggregateCriterionOverall(params.allRows);

  const reportNavSubtree = renderReportNavSubtree(params.runs);

  const hierarchicalNavMarkup = `
<ol class="nav-tree-root">
  <li><a href="#run-meta">Report generation details</a></li>
  <li>
    <a href="#per-report-intro">Per-report evaluations</a>
${reportNavSubtree}
  </li>
  <li><a href="#aggregate-criterion">Aggregate: criterion totals</a></li>
  <li><a href="#specific-buckets">Specific issue buckets</a></li>
  <li><a href="#generic-themes">Generic follow-up themes</a></li>
</ol>`;

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
<details>
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
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Bulk deviation evaluation (${params.runs.length} reports)</title>
<style>
 :root {
   --green: #166534;
   --amber: #a16207;
   --red: #b91c1c;
   --muted: #6b7280;
   --border: #e5e7eb;
   --surface: #f9fafb;
   --sidebar-w: min(280px, 32vw);
   --accent: #1d4ed8;
 }
 html { scroll-behavior: smooth; }
 html { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.35; background:#fafafa;color:#171717;}
 body { margin:0; padding:0;}
 h1,h2,h3{margin:16px 0 8px;scroll-margin-top:12px;}
 [id]{scroll-margin-top:14px;}
 .skip-link{position:absolute;left:-9999px;z-index:100;padding:8px;background:var(--accent);color:#fff;}
 .skip-link:focus{left:8px;top:8px;}
 .page-shell{display:flex;gap:0;align-items:flex-start;width:100%;max-width:1440px;margin:0 auto;min-height:100vh;}
 .toc-sidebar{
   flex-shrink:0;width:var(--sidebar-w);position:sticky;top:0;align-self:flex-start;height:100vh;
   overflow-y:auto;border-right:1px solid var(--border);background:#fff;z-index:4;
   transition:width .22s ease,transform .22s ease,box-shadow .22s ease;
 }
 .toc-sidebar-inner{padding:14px 12px 24px;display:flex;flex-direction:column;gap:8px;}
 .toc-sidebar-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--border);}
 .toc-sidebar-head span{font-weight:700;font-size:.85rem;color:#374151;text-transform:uppercase;letter-spacing:.04em;}
 .btn{font:inherit;cursor:pointer;border:1px solid var(--border);border-radius:6px;background:var(--surface);padding:5px 8px;font-size:.75rem;color:#374151;line-height:1.2;}
 .btn:hover{border-color:#cbd5e1;background:#eef2ff;}
 .btn.sidebar-toggle{white-space:nowrap;}
 .nav-tree-root,.nav-tree-root ol{list-style:none;margin:0;padding:0;font-size:.8rem;line-height:1.35;}
 .nav-tree-root > li{margin:8px 0 0;padding:0;border-left:2px solid #e5e7eb;padding-left:8px;margin-left:0;}
 .nav-tree-root > li > a{font-weight:600;color:#111827;display:inline-block;margin-bottom:4px;}
 .toc-sub{font-size:.78rem;margin:4px 0 10px!important;padding-left:4px!important;}
 .toc-sub li{margin:6px 0;padding-left:0;border-left:none;}
 .toc-sub a{color:#374151;text-decoration:none;border-radius:4px;padding:3px 4px;display:block;}
 .toc-sub a:hover{background:#f3f4f6;}
 .toc-sub .toc-suffix{display:block;font-size:.65rem;color:var(--muted);margin:-1px 0 0;font-weight:500;}
 .nav-tree-root ol.toc-sub a{font-weight:500;}
 .nav-tree-root a{text-decoration:none;color:#1f2937;}
 .nav-tree-root a:hover{text-decoration:underline;}
 .toc-tree li.active>a{color:var(--accent);font-weight:700;text-decoration:none;}
 .nav-tree-root>li:has(li.active){border-left-color:var(--accent);}
 .doc-main{flex:1;min-width:0;padding:24px clamp(14px,2vw,28px);max-width:calc(1440px - var(--sidebar-w));}
 .top-quick-tables{font-size:.9rem;background:#fff;border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin:16px 0;}
 .top-quick-tables strong{margin-right:6px;color:#374151;}
 .outline-top{font-size:.88rem;margin:12px 0 18px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:4px 10px;}
 .outline-top > summary{font-weight:600;cursor:pointer;padding:10px 4px;color:#374151;}
 .outline-copy{padding:8px 4px 12px;margin:0;max-height:min(420px,50vh);overflow:auto;border-radius:6px;background:var(--surface);}
 .mobile-toc-btn{display:none;margin:8px 0;}
 @media(max-width:960px){
   .page-shell{display:block;}
   .toc-sidebar{position:fixed;left:0;top:0;height:100%;width:min(296px,86vw);max-width:none;transform:translateX(-100%);box-shadow:none;}
   body.sidebar-drawer-open .toc-sidebar{transform:translateX(0);box-shadow:4px 0 24px rgba(0,0,0,.12);}
   .sidebar-drawer-overlay{display:none;}
   body.sidebar-drawer-open .sidebar-drawer-overlay{display:block;position:fixed;inset:0;background:rgba(17,24,39,.42);z-index:3;}
   .doc-main{max-width:none;padding-top:12px;padding-left:clamp(14px,3vw,24px);padding-right:clamp(14px,3vw,24px);}
   .mobile-toc-btn{display:flex;align-items:center;gap:8px;width:100%;justify-content:center;}
 }
 .page-shell.sidebar-collapsed{--sidebar-w:52px;}
 .page-shell.sidebar-collapsed .toc-sidebar{width:52px;overflow:hidden;}
 .page-shell.sidebar-collapsed .toc-sidebar-inner{padding:12px 6px;}
 .page-shell.sidebar-collapsed .toc-hideable{display:none;}
 .page-shell.sidebar-collapsed .nav-tree-root{display:none;}
 .page-shell.sidebar-collapsed .toc-sidebar-expand-only{display:flex;justify-content:center;padding-top:8px;}
 .toc-sidebar-expand-only{display:none;}
 .page-shell.sidebar-collapsed .toc-sidebar-expand-only button{width:36px;height:36px;padding:4px;font-size:1.05rem;line-height:1;}
 @media(max-width:960px){ .sidebar-desktop-only{display:none!important;} }
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
 .run-meta{margin:12px 0 18px;border:1px solid var(--border);border-radius:8px;background:#fff;padding:8px 12px;}
 .meta-table{font-size:.82rem;width:100%;}
 .meta-table th[scope="row"]{vertical-align:top;white-space:nowrap;width:260px;color:#374151;font-weight:600;}
 .meta-table td{vertical-align:top;}
 @media print {
   .page-shell{display:block!important;}
   .toc-sidebar,.mobile-toc-btn,.sidebar-drawer-overlay,.outline-top{display:none!important;}
   html{scroll-behavior:auto!important;}
   .doc-main{max-width:none;padding:0;}
   body{font-size:10px;margin:12px!important;}
   .report-card{page-break-after:always;margin:0 0 10px;padding:10px;border:none;}
   .sep{display:none;}
   .compact-table{font-size:9px;}
 }
</style>
</head>
<body>
<a href="#report-main-start" class="skip-link">Skip to main content</a>
<button type="button" class="btn mobile-toc-btn" id="mobile-toc-open" aria-controls="doc-sidebar">
  ☰ Outline & navigation
</button>
<div class="sidebar-drawer-overlay" id="sidebar-drawer-overlay" aria-hidden="true"></div>

<div class="page-shell" id="page-shell">
<aside id="doc-sidebar" class="toc-sidebar" aria-label="Document outline">
  <div class="toc-sidebar-inner">
    <div class="toc-sidebar-head toc-hideable">
      <span>On this page</span>
      <button type="button" class="btn sidebar-toggle sidebar-desktop-only" id="sidebar-collapse" aria-expanded="true" aria-controls="sidebar-nav-groups" title="Collapse side navigation">
        Hide
      </button>
    </div>
    <div class="toc-sidebar-expand-only">
      <button type="button" class="btn" id="sidebar-expand" aria-label="Expand outline" title="Show outline panel">⌁</button>
    </div>
    <nav class="toc-tree toc-hideable" id="sidebar-nav-groups" aria-label="Section anchors">
${hierarchicalNavMarkup}
    </nav>
  </div>
</aside>

<main class="doc-main" id="report-main-start">
<h1>Bulk deviation traffic-light evaluation</h1>

<details class="run-meta" id="run-meta">
<summary>Report generation details (prompt + LLM)</summary>
<table class="meta-table">
<tbody>
${renderRunMetaTable(params.runMeta)}
</tbody>
</table>
</details>

<div class="pill">
<span class="pill-green">Green = met</span>
<span class="pill-amber">Amber = partially met</span>
<span class="pill-red">Red = not met</span>
<span class="pill-muted">Gray = not evaluated</span>
</div>

<p class="top-quick-tables" role="navigation" aria-label="Jump links for long report">
<strong>Navigate:</strong>
<a href="#run-meta">Run / LLM details</a><span aria-hidden="true"> · </span>
<a href="#per-report-intro">Per-report scores</a>
<br/>
<strong>Aggregate tables:</strong>
<a href="#aggregate-criterion">Criterion traffic-light totals</a><span aria-hidden="true"> · </span>
<a href="#specific-buckets">Specific issue buckets</a><span aria-hidden="true"> · </span>
<a href="#generic-themes">Generic follow-up themes</a>
</p>

<details class="outline-top" open>
<summary>Full hierarchical outline</summary>
<div class="outline-copy">
${hierarchicalNavMarkup}
</div>
</details>

<hr class="sep"/>

<h2 id="per-report-intro">Per-report evaluations</h2>
${reportSectionsHtml}

<hr class="sep"/>

<h2 id="aggregate-criterion">Aggregate: traffic light totals per criterion</h2>
<p class="muted">Columns: met (green), partially met (amber), not met (red), not evaluated (?).</p>
<table>
<thead><tr><th>Criterion key</th><th>Label</th><th>Met</th><th>Partial</th><th>Not met</th><th>Not eval</th></tr></thead>
<tbody>${overviewRows.join("\n")}</tbody></table>

<h2 id="specific-buckets">Specific issue buckets (non-met statuses)</h2>
<p class="muted">Weighted by deduplicated reasoning text across reports. Labels are multi-assign; counts can overlap.</p>
<table>
<thead><tr><th>Pattern</th><th>Occurrences</th><th>Top criteria keys</th><th>Example reasoning</th></tr></thead>
<tbody>${specificPatternRowsHtml}</tbody>
</table>

<h2 id="generic-themes">Generic follow-up themes</h2>
<p class="muted">Second-pass broader themes; overlaps with specific buckets are expected.</p>
<table>
<thead><tr><th>Theme</th><th>Occurrences</th><th>Top criteria keys</th><th>Example reasoning</th></tr></thead>
<tbody>${genericPatternRowsHtml}</tbody>
</table>
</main>
</div>
<script>
(function () {
  var shell = document.getElementById("page-shell");
  var aside = document.getElementById("doc-sidebar");
  var collapseBtn = document.getElementById("sidebar-collapse");
  var expandBtn = document.getElementById("sidebar-expand");
  var expandWrap = aside && aside.querySelector(".toc-sidebar-expand-only");
  var mq = window.matchMedia("(min-width: 961px)");
  function mqDesktop() {
    return mq.matches;
  }
  try {
    if (
      mqDesktop() &&
      localStorage.getItem("bulkEvalSidebarCollapsed") === "1" &&
      shell
    ) {
      shell.classList.add("sidebar-collapsed");
    }
  } catch (_e) {}

  function setCollapsed(c) {
    if (!shell) return;
    shell.classList.toggle("sidebar-collapsed", c);
    if (collapseBtn)
      collapseBtn.setAttribute("aria-expanded", c ? "false" : "true");
    if (expandWrap) expandWrap.style.display =
      mqDesktop() && c ? "flex" : "none";
    try {
      localStorage.setItem("bulkEvalSidebarCollapsed", c ? "1" : "0");
    } catch (_e) {}
  }
  if (collapseBtn)
    collapseBtn.addEventListener("click", function () {
      setCollapsed(true);
    });
  if (expandBtn)
    expandBtn.addEventListener("click", function () {
      setCollapsed(false);
    });
  mq.addEventListener("change", function () {
    document.body.classList.remove("sidebar-drawer-open");
    if (expandWrap)
      expandWrap.style.display =
        mqDesktop() && shell && shell.classList.contains("sidebar-collapsed")
          ? "flex"
          : "none";
  });
  if (expandWrap) {
    expandWrap.style.display =
      mqDesktop() && shell && shell.classList.contains("sidebar-collapsed")
        ? "flex"
        : "none";
  }

  var overlay = document.getElementById("sidebar-drawer-overlay");
  var mobOpen = document.getElementById("mobile-toc-open");
  if (mobOpen)
    mobOpen.addEventListener("click", function () {
      document.body.classList.add("sidebar-drawer-open");
    });
  if (overlay)
    overlay.addEventListener("click", function () {
      document.body.classList.remove("sidebar-drawer-open");
    });
  if (aside) {
    var tree = aside.querySelector(".toc-tree");
    if (tree)
      tree.addEventListener("click", function (e) {
        if (e.target && e.target.closest("a") && !mqDesktop()) {
          document.body.classList.remove("sidebar-drawer-open");
        }
      });
  }

  var nav = document.getElementById("sidebar-nav-groups");
  if (!nav || !shell) return;

  var anchors = [].slice.call(nav.querySelectorAll('a[href^="#"]'));
  var elems = [];
  var seen = {};
  anchors.forEach(function (a) {
    var hid;
    try {
      hid = decodeURIComponent(a.getAttribute("href").slice(1));
    } catch (_e) {
      return;
    }
    if (!hid || seen[hid]) return;
    var el = document.getElementById(hid);
    if (!el) return;
    seen[hid] = true;
    elems.push(el);
  });

  function refreshActive() {
    var probe = window.scrollY + Math.min(120, window.innerHeight * 0.18);
    var current = elems.length ? elems[0].id : "";
    var i;
    for (i = 0; i < elems.length; i++) {
      var el = elems[i];
      var top = window.scrollY + el.getBoundingClientRect().top;
      if (top <= probe + 1) current = el.id;
    }
    anchors.forEach(function (a) {
      var lid;
      try {
        lid = decodeURIComponent(a.getAttribute("href").slice(1));
      } catch (_e) {
        return;
      }
      var li = a.closest("li");
      if (!li) return;
      var on = lid === current;
      li.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }

  window.addEventListener(
    "scroll",
    function () {
      refreshActive();
    },
    { passive: true }
  );
  refreshActive();

  nav.addEventListener("click", function (e) {
    var tg = e.target && e.target.closest("a");
    if (!tg) return;
    var href = tg.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;
    setTimeout(refreshActive, 100);
  });
})();
</script>



</body>
</html>`;
}

async function main() {
  const { inputDir, outOverride, docConcurrency } = parseArgs(
    process.argv.slice(2)
  );
  const outFile =
    outOverride ?? defaultTimestampedReportFile(process.cwd());
  console.error(`Scanning DOCX inputs in: ${inputDir}`);
  console.error(`Output HTML path: ${outFile}`);
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

  const finishedAt = new Date();
  const criterionLlm = describeCriterionEvaluationLlmFootprint();

  const html = htmlReport({
    runs,
    allRows,
    specificPatternRows,
    genericPatternRows,
    runMeta: {
      outputPath: outFile,
      generatedAtIso: finishedAt.toISOString(),
      generatedAtLocal: finishedAt.toString(),
      promptVersion: PROMPT_VERSION,
      criterionLlm,
      bucketLlm: REASONING_BUCKET_LAYER_LLM,
      clusteringNote,
    },
  });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  console.error(`Wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
