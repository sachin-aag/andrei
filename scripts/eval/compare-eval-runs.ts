/**
 * Compares 2+ `.eval.json` sidecar files produced by `bulk-sample-evaluation-report.ts`
 * and generates an HTML report highlighting where models disagree.
 *
 *   npm run compare-evals -- reports/run_a.eval.json reports/run_b.eval.json
 *   npm run compare-evals -- reports/*.eval.json
 */

import fs from "node:fs";
import path from "node:path";

import type { CriterionStatus } from "@/db/schema";
import type { EvalRunJson } from "./bulk-sample-evaluation-report";
import { formatModelRunLabel, type EvalEffort } from "@/lib/eval/eval-generation-options";
import type { ModelSpec } from "@/lib/eval/model-resolver";
import { escapeHtml } from "@/lib/sample-eval/bulk-eval-aggregates";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type RunLabel = string; // e.g. "google/gemini-3.1-flash-lite"

type DatapointKey = string; // "sourceFile|criterionKey"

type DatapointEntry = {
  sourceFile: string;
  criterionKey: string;
  criterionLabel: string;
  section: string;
  sectionText?: string;
  results: Map<RunLabel, { status: CriterionStatus; reasoning: string }>;
};

/* -------------------------------------------------------------------------- */
/*  CLI args                                                                   */
/* -------------------------------------------------------------------------- */

function parseArgs(argv: string[]): { jsonPaths: string[]; outOverride?: string } {
  const jsonPaths: string[] = [];
  let outOverride: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" && argv[i + 1]) {
      outOverride = path.resolve(argv[++i]);
    } else if (a.endsWith(".eval.json") || a.endsWith(".json")) {
      jsonPaths.push(path.resolve(a));
    }
  }
  return { jsonPaths, outOverride };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function makeRunLabel(meta: EvalRunJson["meta"]): string {
  if (meta.runLabel) return meta.runLabel;
  return formatModelRunLabel({
    provider: meta.provider as ModelSpec["provider"],
    modelId: meta.modelId,
    ...(meta.temperature !== undefined ? { temperature: meta.temperature } : {}),
    seed: meta.seed,
    effort: (meta.effort ?? "none") as EvalEffort,
    location: meta.location,
  });
}

function dpKey(sourceFile: string, criterionKey: string): DatapointKey {
  return `${sourceFile}|${criterionKey}`;
}

/** Disagreement severity: not_met↔met is highest. */
function disagreementSeverity(statuses: CriterionStatus[]): number {
  const has = (s: CriterionStatus) => statuses.includes(s);
  if (has("not_met") && has("met")) return 3;
  if (has("not_met") && has("partially_met")) return 2;
  if (has("partially_met") && has("met")) return 1;
  return 0;
}

function statusBadgeClass(status: CriterionStatus): string {
  switch (status) {
    case "met": return "ok";
    case "partially_met": return "partial";
    case "not_met": return "fail";
    default: return "muted";
  }
}

function sectionTextLookup(
  runs: { label: RunLabel; data: EvalRunJson }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const run of runs) {
    for (const report of run.data.reports) {
      if (!report.sectionTexts) continue;
      for (const [section, text] of Object.entries(report.sectionTexts)) {
        const key = `${report.sourceFile}|${section}`;
        if (!map.has(key) && typeof text === "string" && text.trim()) {
          map.set(key, text);
        }
      }
    }
  }
  return map;
}

function renderSectionTextBlock(text?: string): string {
  if (!text?.trim()) {
    return `<p class="muted section-text-missing">Section text not available (re-run eval to capture).</p>`;
  }
  return `<details class="section-text-detail">
<summary>Section text</summary>
<pre class="section-text">${escapeHtml(text)}</pre>
</details>`;
}

function renderCriterionCell(dp: DatapointEntry): string {
  const keyNote =
    dp.criterionKey !== dp.criterionLabel
      ? `<small class="muted criterion-key">${escapeHtml(dp.criterionKey)}</small>`
      : "";
  return `<div class="criterion-cell">
<strong>${escapeHtml(dp.criterionLabel)}</strong>
${keyNote}
${renderSectionTextBlock(dp.sectionText)}
</div>`;
}

/* -------------------------------------------------------------------------- */
/*  Core comparison logic                                                      */
/* -------------------------------------------------------------------------- */

function buildComparison(runs: { label: RunLabel; data: EvalRunJson }[]) {
  const labels = runs.map((r) => r.label);
  const datapoints = new Map<DatapointKey, DatapointEntry>();
  const sectionTexts = sectionTextLookup(runs);

  // Populate datapoints from all runs
  for (const run of runs) {
    for (const report of run.data.reports) {
      for (const row of report.rows) {
        const key = dpKey(report.sourceFile, row.criterionKey);
        let dp = datapoints.get(key);
        if (!dp) {
          dp = {
            sourceFile: report.sourceFile,
            criterionKey: row.criterionKey,
            criterionLabel: row.criterionLabel,
            section: row.section,
            sectionText: sectionTexts.get(`${report.sourceFile}|${row.section}`),
            results: new Map(),
          };
          datapoints.set(key, dp);
        }
        dp.results.set(run.label, {
          status: row.status,
          reasoning: row.reasoning,
        });
      }
    }
  }

  // Classify agreement / disagreement
  const allDps = [...datapoints.values()];
  const totalDatapoints = allDps.length;

  let agreeCount = 0;
  const disagreements: DatapointEntry[] = [];

  for (const dp of allDps) {
    const statuses = new Set([...dp.results.values()].map((r) => r.status));
    if (statuses.size <= 1) {
      agreeCount++;
    } else {
      disagreements.push(dp);
    }
  }

  // Sort disagreements by severity (worst first)
  disagreements.sort((a, b) => {
    const sevA = disagreementSeverity([...a.results.values()].map((r) => r.status));
    const sevB = disagreementSeverity([...b.results.values()].map((r) => r.status));
    return sevB - sevA;
  });

  // Pairwise agreement
  const pairwise: { a: string; b: string; agree: number; total: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      let agree = 0;
      let total = 0;
      for (const dp of allDps) {
        const rA = dp.results.get(labels[i]);
        const rB = dp.results.get(labels[j]);
        if (rA && rB) {
          total++;
          if (rA.status === rB.status) agree++;
        }
      }
      pairwise.push({ a: labels[i], b: labels[j], agree, total });
    }
  }

  // Per-criterion disagreement rate
  const criterionDisagree = new Map<string, { label: string; section: string; disagree: number; total: number }>();
  for (const dp of allDps) {
    let rec = criterionDisagree.get(dp.criterionKey);
    if (!rec) {
      rec = { label: dp.criterionLabel, section: dp.section, disagree: 0, total: 0 };
      criterionDisagree.set(dp.criterionKey, rec);
    }
    rec.total++;
    const statuses = new Set([...dp.results.values()].map((r) => r.status));
    if (statuses.size > 1) rec.disagree++;
  }

  // Per-report disagreement rate
  const reportDisagree = new Map<string, { disagree: number; total: number }>();
  for (const dp of allDps) {
    let rec = reportDisagree.get(dp.sourceFile);
    if (!rec) {
      rec = { disagree: 0, total: 0 };
      reportDisagree.set(dp.sourceFile, rec);
    }
    rec.total++;
    const statuses = new Set([...dp.results.values()].map((r) => r.status));
    if (statuses.size > 1) rec.disagree++;
  }

  // Strictness: % of criteria rated not_met per run
  const strictness: { label: string; notMet: number; total: number }[] = labels.map((label) => {
    let notMet = 0;
    let total = 0;
    for (const dp of allDps) {
      const r = dp.results.get(label);
      if (r) {
        total++;
        if (r.status === "not_met") notMet++;
      }
    }
    return { label, notMet, total };
  });
  strictness.sort((a, b) => (b.notMet / (b.total || 1)) - (a.notMet / (a.total || 1)));

  return {
    labels,
    runs,
    totalDatapoints,
    agreeCount,
    disagreements,
    pairwise,
    criterionDisagree,
    reportDisagree,
    strictness,
  };
}

/* -------------------------------------------------------------------------- */
/*  HTML generation                                                            */
/* -------------------------------------------------------------------------- */

function generateHtml(comparison: ReturnType<typeof buildComparison>): string {
  const {
    labels,
    runs,
    totalDatapoints,
    agreeCount,
    disagreements,
    pairwise,
    criterionDisagree,
    reportDisagree,
    strictness,
  } = comparison;

  const agreePercent = totalDatapoints > 0
    ? Math.round((agreeCount / totalDatapoints) * 100)
    : 0;

  // Run summary table
  const runSummaryRows = runs
    .map((r) => `<tr>
<td>${escapeHtml(r.label)}</td>
<td>${escapeHtml(r.data.meta.provider)}</td>
<td>${escapeHtml(r.data.meta.modelId)}</td>
<td>${r.data.meta.temperature ?? "—"}</td>
<td>${escapeHtml(r.data.meta.effort ?? "none")}</td>
<td>${r.data.meta.seed ?? "—"}</td>
<td>${escapeHtml(r.data.meta.promptVersion)}</td>
<td>${escapeHtml(r.data.meta.generatedAt)}</td>
</tr>`)
    .join("\n");

  // Pairwise agreement table
  const pairwiseRows = pairwise
    .map((p) => {
      const pct = p.total > 0 ? Math.round((p.agree / p.total) * 100) : 0;
      return `<tr>
<td>${escapeHtml(p.a)}</td>
<td>${escapeHtml(p.b)}</td>
<td>${p.agree} / ${p.total} (${pct}%)</td>
</tr>`;
    })
    .join("\n");

  // Disagreement table
  const disagreementRows = disagreements
    .map((dp) => {
      const cells = labels
        .map((label) => {
          const r = dp.results.get(label);
          if (!r) return `<td class="muted">—</td>`;
          return `<td>
<span class="badge ${statusBadgeClass(r.status)}">${escapeHtml(r.status.replace(/_/g, " "))}</span>
<small class="reasoning-text">${escapeHtml(r.reasoning)}</small>
</td>`;
        })
        .join("\n");

      return `<tr>
<td>${escapeHtml(dp.sourceFile)}</td>
<td><strong>${escapeHtml(dp.section.toUpperCase())}</strong></td>
<td>${renderCriterionCell(dp)}</td>
${cells}
</tr>`;
    })
    .join("\n");

  // Per-criterion disagreement rate
  const criterionDisagreeRows = [...criterionDisagree.entries()]
    .sort(([, a], [, b]) => (b.disagree / (b.total || 1)) - (a.disagree / (a.total || 1)))
    .map(([, rec]) => {
      const pct = rec.total > 0 ? Math.round((rec.disagree / rec.total) * 100) : 0;
      return `<tr>
<td>${escapeHtml(rec.label)}</td>
<td>${escapeHtml(rec.section.toUpperCase())}</td>
<td>${rec.disagree} / ${rec.total} (${pct}%)</td>
</tr>`;
    })
    .join("\n");

  // Per-report disagreement rate
  const reportDisagreeRows = [...reportDisagree.entries()]
    .sort(([, a], [, b]) => (b.disagree / (b.total || 1)) - (a.disagree / (a.total || 1)))
    .map(([file, rec]) => {
      const pct = rec.total > 0 ? Math.round((rec.disagree / rec.total) * 100) : 0;
      return `<tr>
<td>${escapeHtml(file)}</td>
<td>${rec.disagree} / ${rec.total} (${pct}%)</td>
</tr>`;
    })
    .join("\n");

  // Strictness ranking
  const strictnessRows = strictness
    .map((s) => {
      const pct = s.total > 0 ? Math.round((s.notMet / s.total) * 100) : 0;
      return `<tr>
<td>${escapeHtml(s.label)}</td>
<td>${s.notMet} / ${s.total} (${pct}%)</td>
</tr>`;
    })
    .join("\n");

  const modelHeaders = labels.map((l) => `<th>${escapeHtml(l)}</th>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Eval Run Comparison (${labels.length} models)</title>
<style>
:root {
  --green: #166534;
  --amber: #a16207;
  --red: #b91c1c;
  --muted: #6b7280;
  --border: #e5e7eb;
  --surface: #f9fafb;
}
html { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; line-height:1.35; background:#fafafa; color:#171717; }
body { margin: 0 auto; max-width: 1400px; padding: 24px clamp(14px,2vw,28px); }
h1,h2,h3 { margin: 20px 0 10px; }
table { border-collapse: collapse; font-size: .85rem; width: 100%; margin: 16px 0; background: #fff; }
th, td { border: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
thead th { background: var(--surface); position: sticky; top: 0; z-index: 1; }
.badge { display: inline-block; border-radius: 999px; padding: 2px 7px; color: #fff; font-size: .68rem; font-weight: 700; white-space: nowrap; }
.badge.ok { background: var(--green); }
.badge.partial { background: var(--amber); }
.badge.fail { background: var(--red); }
.badge.muted { background: #4b5563; }
.muted { color: var(--muted); font-size: .85rem; }
small { display: block; margin-top: 2px; color: #374151; font-size: .78rem; }
.reasoning-text { white-space: normal; word-break: break-word; line-height: 1.45; font-size: .82rem; }
.criterion-cell strong { display: block; margin-bottom: 4px; }
.criterion-key { display: block; margin-bottom: 6px; font-size: .75rem; }
.section-text-detail { margin-top: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.section-text-detail > summary { padding: 6px 8px; font-size: .78rem; font-weight: 600; cursor: pointer; list-style: none; }
.section-text-detail > summary::-webkit-details-marker { display: none; }
.section-text-detail > summary::before { content: "▸ "; color: var(--muted); font-size: .72rem; }
.section-text-detail[open] > summary::before { content: "▾ "; }
.section-text { margin: 0; padding: 8px 10px; max-height: min(320px, 40vh); overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .74rem; line-height: 1.4; background: #fff; border-top: 1px solid var(--border); }
.section-text-missing { margin: 6px 0 0; font-size: .78rem; }
.score-big { font-weight: 800; font-size: 2rem; color: var(--green); margin: 8px 0; }
.score-big span { display: block; font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }
.summary-card { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: #fff; text-align: center; }
.summary-card strong { display: block; font-size: 1.4rem; }
.summary-card span { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.panel { border: 1px solid var(--border); border-radius: 8px; background: #fff; margin: 16px 0; }
.panel > summary { padding: 11px 14px; font-weight: 600; font-size: .95rem; cursor: pointer; list-style: none; }
.panel > summary::-webkit-details-marker { display: none; }
.panel > summary::marker { font-size: 0; }
.panel > summary::before { content: "▾ "; font-size: .72rem; color: var(--muted); margin-right: 5px; }
.panel:not([open]) > summary::before { content: "▸ "; }
.panel[open] > summary { border-bottom: 1px solid var(--border); background: var(--surface); }
.panel-body { padding: 8px 14px 14px; }
.narrow-note { margin: 8px 0 4px; font-size: .82rem; color: var(--muted); }
</style>
</head>
<body>
<h1>Multi-Model Evaluation Comparison</h1>
<p class="muted">${labels.length} runs compared · ${totalDatapoints} datapoints · Generated ${new Date().toISOString()}</p>

<div class="summary-grid">
  <div class="summary-card">
    <strong>${agreePercent}%</strong>
    <span>Overall agreement</span>
  </div>
  <div class="summary-card">
    <strong>${agreeCount}</strong>
    <span>Agreed datapoints</span>
  </div>
  <div class="summary-card">
    <strong>${disagreements.length}</strong>
    <span>Disagreements</span>
  </div>
  <div class="summary-card">
    <strong>${totalDatapoints}</strong>
    <span>Total datapoints</span>
  </div>
</div>

<details class="panel" open>
<summary>Run summary</summary>
<div class="panel-body">
<table>
<thead><tr><th>Run label</th><th>Provider</th><th>Model ID</th><th>Temp</th><th>Effort</th><th>Seed</th><th>Prompt version</th><th>Generated at</th></tr></thead>
<tbody>${runSummaryRows}</tbody>
</table>
</div>
</details>

<details class="panel" open>
<summary>Pairwise agreement matrix</summary>
<div class="panel-body">
<p class="narrow-note">For each pair of runs, the percentage of datapoints where both runs assigned the same status.</p>
<table>
<thead><tr><th>Run A</th><th>Run B</th><th>Agreement</th></tr></thead>
<tbody>${pairwiseRows}</tbody>
</table>
</div>
</details>

<details class="panel" open>
<summary>Disagreement table (${disagreements.length} rows)</summary>
<div class="panel-body">
<p class="narrow-note">Sorted by severity — not_met↔met disagreements first. Each column shows the status and reasoning from that run.</p>
<table>
<thead><tr><th>Source file</th><th>Section</th><th>Criterion</th>${modelHeaders}</tr></thead>
<tbody>${disagreementRows || '<tr><td colspan="' + (3 + labels.length) + '">No disagreements — all runs agree on every datapoint.</td></tr>'}</tbody>
</table>
</div>
</details>

<details class="panel" open>
<summary>Per-criterion disagreement rate</summary>
<div class="panel-body">
<p class="narrow-note">Which criteria have the highest cross-model disagreement — candidates for prompt refinement.</p>
<table>
<thead><tr><th>Criterion</th><th>Section</th><th>Disagreement rate</th></tr></thead>
<tbody>${criterionDisagreeRows}</tbody>
</table>
</div>
</details>

<details class="panel" open>
<summary>Per-report disagreement rate</summary>
<div class="panel-body">
<p class="narrow-note">Which sample files are most contested across models.</p>
<table>
<thead><tr><th>Source file</th><th>Disagreement rate</th></tr></thead>
<tbody>${reportDisagreeRows}</tbody>
</table>
</div>
</details>

<details class="panel" open>
<summary>Strictness ranking</summary>
<div class="panel-body">
<p class="narrow-note">Which model rates more criteria as not_met overall (stricter = higher %).</p>
<table>
<thead><tr><th>Model</th><th>Not-met rate</th></tr></thead>
<tbody>${strictnessRows}</tbody>
</table>
</div>
</details>

</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

function defaultComparisonReportFile(): string {
  const n = new Date();
  const ts = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}_${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`;
  return path.join(process.cwd(), "reports", `comparison_report_${ts}.html`);
}

function main() {
  const { jsonPaths, outOverride } = parseArgs(process.argv.slice(2));

  if (jsonPaths.length < 2) {
    console.error("Usage: compare-eval-runs <run1.eval.json> <run2.eval.json> [run3.eval.json ...]");
    console.error("At least 2 .eval.json files are required.");
    process.exit(1);
  }

  const runs: { label: RunLabel; data: EvalRunJson }[] = [];
  for (const p of jsonPaths) {
    if (!fs.existsSync(p)) {
      console.error(`File not found: ${p}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw) as EvalRunJson;
    const label = makeRunLabel(data.meta);
    console.error(`Loaded: ${label} (${data.reports.length} reports) from ${path.basename(p)}`);
    runs.push({ label, data });
  }

  // Disambiguate duplicate labels by appending index
  const labelCounts = new Map<string, number>();
  for (const r of runs) {
    const c = (labelCounts.get(r.label) ?? 0) + 1;
    labelCounts.set(r.label, c);
  }
  for (const [label, count] of labelCounts) {
    if (count > 1) {
      let idx = 1;
      for (const r of runs) {
        if (r.label === label) {
          r.label = `${label} #${idx++}`;
        }
      }
    }
  }

  const comparison = buildComparison(runs);
  const html = generateHtml(comparison);

  const outFile = outOverride ?? defaultComparisonReportFile();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  console.error(`Wrote comparison report: ${outFile}`);
}

main();
