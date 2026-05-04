/**
 * Deviation Investigation Report Scorer
 *
 * Usage:
 *   npx tsx scripts/score-report.ts [file1.docx file2.docx ...]
 *   npx tsx scripts/score-report.ts                              # scores all in docs/dataset/
 *
 * Outputs: scores.html in the project root
 */

import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import mammoth from "mammoth";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

config({ path: ".env.local" });
config({ path: ".env" });

// ── Criteria ────────────────────────────────────────────────────────────────

type Section = "define" | "measure" | "analyze" | "improve" | "control";

type Criterion = {
  key: string;
  section: Section;
  label: string;
  description: string;
};

const CRITERIA: Criterion[] = [
  // DEFINE (6)
  {
    key: "define.what_happened",
    section: "define",
    label: "Clearly define what happened",
    description:
      "Does the narrative clearly describe the actual event in concrete, factual terms — " +
      "including the specific activity being performed, the instrument/equipment involved " +
      "(with ID), and the exact observation or result obtained? " +
      "Vague statements like 'it was observed that results were out of spec' are insufficient.",
  },
  {
    key: "define.what_is_different",
    section: "define",
    label: "Explain what is different than expected",
    description:
      "Does the narrative explicitly state both the expected standard/acceptance criteria " +
      "AND the observed deviation from it, with reference to the governing SOP (including SOP " +
      "number, revision number, title, and relevant section number)?",
  },
  {
    key: "define.location",
    section: "define",
    label: "Location where deviation occurred",
    description:
      "Is a specific physical location identified, including the room name/number or area " +
      "code (e.g., 'Instrument Lab - II (FF-16)')? Simply stating the department is insufficient.",
  },
  {
    key: "define.datetime",
    section: "define",
    label: "Date/time of occurrence and detection",
    description:
      "Does the narrative specify both the date AND time (HH:MM) of when the deviation " +
      "occurred, and separately when it was detected? Date-only is insufficient.",
  },
  {
    key: "define.personnel",
    section: "define",
    label: "Personnel involved",
    description:
      "Are all personnel identified by their Employee ID (Emp. ID)? Generic references such " +
      "as 'the analyst' without an Emp. ID are insufficient.",
  },
  {
    key: "define.initial_scope",
    section: "define",
    label: "Initial scope (impacted product/material/equipment/batches)",
    description:
      "Is the initial scope explicitly stated with specific identifiers such as batch numbers, " +
      "equipment IDs, affected departments? Vague scope statements are insufficient.",
  },

  // MEASURE (5)
  {
    key: "measure.facts_data",
    section: "measure",
    label: "Relevant facts and data reviewed",
    description:
      "Does the summary provide relevant facts and data reviewed including environment, " +
      "process/product history, personnel info (title and job title), control limits?",
  },
  {
    key: "measure.analysis_summary",
    section: "measure",
    label: "Summary of analysis of factors and data",
    description: "Is a summary of the analysis of the factors and data provided?",
  },
  {
    key: "measure.conclusion_statement",
    section: "measure",
    label: "Conclusion statement of the analysis",
    description: "Is a clear conclusion statement of the analysis and review provided?",
  },
  {
    key: "measure.regulatory_notification",
    section: "measure",
    label: "Regulatory notification details (if applicable)",
    description:
      "If there were regulatory notifications, are the details provided? " +
      "If not applicable, is that stated explicitly?",
  },
  {
    key: "measure.logical_flow",
    section: "measure",
    label: "Logical flow and readability",
    description: "Is the report written in a logical flow and easily understood by the reader?",
  },

  // ANALYZE (5)
  {
    key: "analyze.sixm_completeness",
    section: "analyze",
    label: "6M method completeness",
    description:
      "Are all 6M fields filled (Man, Machine, Measurement, Material, Method, Milieu) " +
      "with an answer (even if 'Not Applicable') and a conclusion provided?",
  },
  {
    key: "analyze.fivewhy_completeness",
    section: "analyze",
    label: "5-Why approach completeness",
    description:
      "Are the 5-Why questions and answers filled (with Not Applicable where appropriate) " +
      "and a conclusion provided?",
  },
  {
    key: "analyze.investigation_outcome",
    section: "analyze",
    label: "Investigation outcome summarized",
    description: "Is the investigation outcome clearly described, referencing the tools used?",
  },
  {
    key: "analyze.root_cause",
    section: "analyze",
    label: "Root cause categorization (Level 1, 2, 3)",
    description: "Is the primary, secondary, and third level root cause identified per SOP?",
  },
  {
    key: "analyze.impact_assessment",
    section: "analyze",
    label: "Impact assessment (System/Document/Product/Equipment/Patient safety)",
    description:
      "Is the impact assessment filled for all five fields with a clear statement for each?",
  },

  // IMPROVE (6)
  {
    key: "improve.specific_actions",
    section: "improve",
    label: "Specific corrective actions identified (including immediate actions)",
    description:
      "Were specific corrective actions identified to remediate the current issue such " +
      "that the associated system was returned to a state of control/compliance?",
  },
  {
    key: "improve.per_root_cause",
    section: "improve",
    label: "Corrective actions for each root cause",
    description:
      "Were specific corrective actions identified for each root cause / substantiated " +
      "probable root cause, as applicable?",
  },
  {
    key: "improve.tracking_fields",
    section: "improve",
    label: "Unique number, responsible person, and due date assigned",
    description:
      "Was the corrective action assigned a unique number, responsible person and due date?",
  },
  {
    key: "improve.expected_outcome",
    section: "improve",
    label: "Expected outcome described and verifiable",
    description: "Does the action describe the expected outcome that can be verified?",
  },
  {
    key: "improve.effectiveness",
    section: "improve",
    label: "Effectiveness verification documented",
    description:
      "Was effectiveness verification required or not, and the rationale for either documented?",
  },
  {
    key: "improve.achievable",
    section: "improve",
    label: "Actions achievable",
    description:
      "Are the identified corrective actions achievable based on the information provided?",
  },

  // CONTROL (14)
  {
    key: "control.preventive_per_root_cause",
    section: "control",
    label: "Preventive actions for each root cause",
    description:
      "Were specific preventive actions identified for each root cause / substantiated " +
      "probable root cause as applicable?",
  },
  {
    key: "control.linked_to_root_cause",
    section: "control",
    label: "Linked to classification of the root cause",
    description:
      "Was the preventive action linked to the classification of the root cause and " +
      "explanation given for how it will prevent recurrence?",
  },
  {
    key: "control.tracking_fields",
    section: "control",
    label: "Unique number, responsible person, due date assigned",
    description:
      "Was the preventive action assigned a unique number, responsible person and due date?",
  },
  {
    key: "control.expected_outcome",
    section: "control",
    label: "Expected outcome verifiable",
    description: "Does the action describe an expected outcome that can be verified?",
  },
  {
    key: "control.effectiveness",
    section: "control",
    label: "Effectiveness verification documented",
    description:
      "Was effectiveness verification required or not, and the rationale for either documented?",
  },
  {
    key: "control.interim_plan",
    section: "control",
    label: "Interim plan addressed",
    description:
      "Was an interim plan needed to ensure a state of control while preventive actions " +
      "were implemented? If not, is rationale provided?",
  },
  {
    key: "control.no_preventive_rationale",
    section: "control",
    label: "Rationale when no preventive action is identified",
    description: "Was rationale provided when no preventive action was identified?",
  },
  {
    key: "control.final_comments",
    section: "control",
    label: "Final comments support conclusion of investigation and CAPA",
    description:
      "Do the final comments include rationale to support the conclusion of the investigation and CAPA?",
  },
  {
    key: "control.impact_fields_complete",
    section: "control",
    label: "Impact assessment fields complete (Regulatory, Product Quality, Validation, Stability, Market/Clinical)",
    description: "Was each of the impact assessment fields completed correctly?",
  },
  {
    key: "control.lot_disposition",
    section: "control",
    label: "Recommended lot disposition matches conclusions",
    description:
      "Does the recommended lot disposition match the conclusions of the investigation and impact assessment?",
  },
  {
    key: "control.conclusion_final_decision",
    section: "control",
    label: "Conclusion includes final decision and rationale",
    description:
      "Does the conclusion include final decision and rationale (e.g., whether regulatory notification is required)?",
  },
  {
    key: "control.capa_verified",
    section: "control",
    label: "CAPA verified complete prior to lot disposition",
    description:
      "CAPA required to release material or batches has been verified to be complete and closed prior to disposition.",
  },
  {
    key: "control.conclusion_summary",
    section: "control",
    label: "Conclusion includes summary of root cause, scope/impact, lot details",
    description:
      "Does the conclusion include a brief summary of root cause, final scope/impact, impact assessment and relevant lot details?",
  },
  {
    key: "control.preventive_achievable",
    section: "control",
    label: "Preventive actions achievable",
    description:
      "Are the identified preventive actions achievable based on the information provided?",
  },
];

const SECTIONS: Section[] = ["define", "measure", "analyze", "improve", "control"];
const SECTION_LABELS: Record<Section, string> = {
  define: "Define",
  measure: "Measure",
  analyze: "Analyze",
  improve: "Improve (Corrective Action)",
  control: "Control (Preventive Action)",
};

// ── Types ────────────────────────────────────────────────────────────────────

type Status = "met" | "partially_met" | "not_met";

type EvalResult = {
  criterionKey: string;
  status: Status;
  reasoning: string;
  suggestion: string;
};

type ReportResult = {
  filename: string;
  reportId: string;
  evaluations: EvalResult[];
  score: number;
  sectionScores: Record<Section, { points: number; max: number }>;
};

// ── LLM ─────────────────────────────────────────────────────────────────────

function buildModel() {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No Gemini API key found. Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local"
    );
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google("gemini-2.5-flash");
}

const evalSchema = z.object({
  evaluations: z.array(
    z.object({
      criterionKey: z.string(),
      status: z.enum(["met", "partially_met", "not_met"]),
      reasoning: z.string().min(1).max(600),
      suggestion: z.string().max(400),
    })
  ),
});

async function evaluateReport(docText: string, reportId: string): Promise<EvalResult[]> {
  const model = buildModel();

  const criteriaList = CRITERIA.map(
    (c, i) =>
      `${i + 1}. [${c.key}] (${SECTION_LABELS[c.section]}) ${c.label}\n   Guidance: ${c.description}`
  ).join("\n\n");

  const system = `You are a senior pharmaceutical quality assurance expert evaluating deviation investigation reports against GMP standards.

For each criterion return:
- "status": "met" | "partially_met" | "not_met"
- "reasoning": 1-3 sentences explaining your judgment based only on what is present in the document
- "suggestion": if status is not "met", a concise instructional note (1-2 sentences) telling the author what specific information to add or correct. Use direct, action-oriented language ("Add the room code...", "Specify the Emp. ID..."). Leave empty string if status is "met".

Be strict: pharmaceutical GMP standards require precise, traceable information. Missing Emp. IDs, times, SOP revision numbers, or room codes should be flagged.`;

  const prompt = `REPORT ID: ${reportId}

DOCUMENT TEXT:
"""
${docText.slice(0, 30000)}
"""

CRITERIA TO EVALUATE (${CRITERIA.length} total):
${criteriaList}

Evaluate every criterion. Return one object per criterion using the exact criterionKey provided.`;

  const { object } = await generateObject({
    model,
    schema: evalSchema,
    system,
    prompt,
    temperature: 0.1,
  });

  const byKey = new Map(object.evaluations.map((e) => [e.criterionKey, e]));

  return CRITERIA.map((c) => {
    const r = byKey.get(c.key);
    if (!r) {
      return {
        criterionKey: c.key,
        status: "not_met" as Status,
        reasoning: "Not evaluated — criterion not returned by model.",
        suggestion: "",
      };
    }
    return { criterionKey: c.key, status: r.status, reasoning: r.reasoning, suggestion: r.suggestion };
  });
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function statusPoints(s: Status): number {
  if (s === "met") return 1;
  if (s === "partially_met") return 0.5;
  return 0;
}

function computeScores(evaluations: EvalResult[]): {
  score: number;
  sectionScores: Record<Section, { points: number; max: number }>;
} {
  const sectionScores = {} as Record<Section, { points: number; max: number }>;
  for (const sec of SECTIONS) {
    const secCriteria = CRITERIA.filter((c) => c.section === sec);
    const points = secCriteria.reduce((sum, c) => {
      const ev = evaluations.find((e) => e.criterionKey === c.key);
      return sum + (ev ? statusPoints(ev.status) : 0);
    }, 0);
    sectionScores[sec] = { points, max: secCriteria.length };
  }
  const totalPoints = Object.values(sectionScores).reduce((s, v) => s + v.points, 0);
  const totalMax = CRITERIA.length;
  const score = Math.round((totalPoints / totalMax) * 100);
  return { score, sectionScores };
}

// ── DOCX parsing ─────────────────────────────────────────────────────────────

async function parseDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

function extractReportId(filename: string): string {
  // Try to find a DEV-XX-XX-XXX pattern
  const match = filename.match(/DEV[-\s]?[A-Z]{2,3}[-\s]?\d{2}[-\s]?\d{3}/i);
  if (match) return match[0].replace(/\s/g, "-").toUpperCase();
  return path.basename(filename, ".docx");
}

// ── HTML generation ──────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function statusBadge(status: Status): string {
  const configs = {
    met: { bg: "#dcfce7", color: "#166534", text: "✓ Met" },
    partially_met: { bg: "#fef9c3", color: "#854d0e", text: "⚠ Partial" },
    not_met: { bg: "#fee2e2", color: "#991b1b", text: "✗ Not Met" },
  };
  const c = configs[status];
  return `<span style="background:${c.bg};color:${c.color};padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;white-space:nowrap">${c.text}</span>`;
}

function scoreBar(score: number): string {
  const color = scoreColor(score);
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="flex:1;background:#e5e7eb;border-radius:4px;height:8px">
      <div style="width:${score}%;background:${color};height:8px;border-radius:4px"></div>
    </div>
    <span style="font-weight:700;color:${color};min-width:40px;text-align:right">${score}/100</span>
  </div>`;
}

function renderSummaryTable(results: ReportResult[]): string {
  const rows = results
    .sort((a, b) => b.score - a.score)
    .map((r) => {
      const secCells = SECTIONS.map((s) => {
        const { points, max } = r.sectionScores[s];
        const pct = Math.round((points / max) * 100);
        const color = scoreColor(pct);
        return `<td style="text-align:center;padding:10px 8px;border-bottom:1px solid #e5e7eb">
          <span style="color:${color};font-weight:600">${points}/${max}</span>
        </td>`;
      }).join("");
      const scoreCol = `<td style="text-align:center;padding:10px 8px;border-bottom:1px solid #e5e7eb">
        <span style="font-weight:700;font-size:18px;color:${scoreColor(r.score)}">${r.score}</span>
      </td>`;
      const link = `<a href="#report-${r.reportId.replace(/[^a-z0-9]/gi, "-")}" style="color:#2563eb;text-decoration:none;font-weight:600">${r.reportId}</a>`;
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb">${link}<br><span style="font-size:11px;color:#6b7280">${r.filename}</span></td>
        ${scoreCol}
        ${secCells}
      </tr>`;
    }).join("");

  // Averages row
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const avgSecCells = SECTIONS.map((s) => {
    const avg = results.reduce((sum, r) => sum + r.sectionScores[s].points, 0) / results.length;
    const max = CRITERIA.filter((c) => c.section === s).length;
    return `<td style="text-align:center;padding:10px 8px;background:#f8fafc;font-weight:600">${avg.toFixed(1)}/${max}</td>`;
  }).join("");

  const headers = ["Report", "Score /100", ...SECTIONS.map((s) => SECTION_LABELS[s])]
    .map((h) => `<th style="padding:10px 8px;text-align:${h === "Report" ? "left" : "center"};background:#f1f5f9;color:#374151;font-size:13px">${h}</th>`)
    .join("");

  // Common failures
  const failCounts: Record<string, number> = {};
  for (const r of results) {
    for (const ev of r.evaluations) {
      if (ev.status === "not_met") {
        failCounts[ev.criterionKey] = (failCounts[ev.criterionKey] ?? 0) + 1;
      }
    }
  }
  const topFails = Object.entries(failCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => {
      const c = CRITERIA.find((cr) => cr.key === key)!;
      return `<li style="padding:6px 0;border-bottom:1px solid #f3f4f6">
        <span style="color:#ef4444;font-weight:600">${count}/${results.length} reports</span>
        &nbsp;—&nbsp;<strong>${c.label}</strong>
        <span style="color:#6b7280;font-size:12px"> (${SECTION_LABELS[c.section]})</span>
      </li>`;
    }).join("");

  return `
  <section style="margin-bottom:48px">
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:16px">Summary — All Reports</h2>
    <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr>${headers}</tr></thead>
        <tbody>
          ${rows}
          <tr>
            <td style="padding:10px 12px;background:#f8fafc;font-weight:700;color:#374151">Average</td>
            <td style="text-align:center;padding:10px 8px;background:#f8fafc;font-weight:700;font-size:18px;color:${scoreColor(avgScore)}">${avgScore}</td>
            ${avgSecCells}
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section style="margin-bottom:48px">
    <h2 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:12px">Most Common Failures</h2>
    <ul style="list-style:none;padding:0;margin:0;border:1px solid #e5e7eb;border-radius:8px;padding:16px">
      ${topFails}
    </ul>
  </section>`;
}

function renderReportDetail(r: ReportResult): string {
  const id = r.reportId.replace(/[^a-z0-9]/gi, "-");

  const sections = SECTIONS.map((sec) => {
    const secCriteria = CRITERIA.filter((c) => c.section === sec);
    const { points, max } = r.sectionScores[sec];
    const pct = Math.round((points / max) * 100);
    const color = scoreColor(pct);

    const rows = secCriteria.map((c) => {
      const ev = r.evaluations.find((e) => e.criterionKey === c.key);
      const status = ev?.status ?? "not_met";
      const reasoning = ev?.reasoning ?? "";
      const suggestion = ev?.suggestion ?? "";

      const suggestionHtml = suggestion
        ? `<div style="margin-top:6px;padding:8px 12px;background:#fff7ed;border-left:3px solid #f59e0b;border-radius:0 4px 4px 0;font-size:13px;color:#92400e">
            <strong>How to fix:</strong> ${suggestion}
           </div>`
        : "";

      return `<tr>
        <td style="padding:12px;border-bottom:1px solid #f3f4f6;vertical-align:top;width:30%">
          <div style="font-weight:600;font-size:13px;color:#1f2937">${c.label}</div>
        </td>
        <td style="padding:12px;border-bottom:1px solid #f3f4f6;vertical-align:top;width:12%">${statusBadge(status)}</td>
        <td style="padding:12px;border-bottom:1px solid #f3f4f6;vertical-align:top">
          <div style="font-size:13px;color:#374151">${reasoning}</div>
          ${suggestionHtml}
        </td>
      </tr>`;
    }).join("");

    return `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#f8fafc;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb">
        <h3 style="margin:0;font-size:15px;font-weight:700;color:#111827">${SECTION_LABELS[sec]}</h3>
        <span style="font-weight:700;color:${color}">${points}/${max} criteria met (${pct}%)</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <colgroup><col style="width:30%"><col style="width:12%"><col></colgroup>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join("");

  return `
  <section id="report-${id}" style="margin-bottom:64px;padding-top:24px;border-top:2px solid #e5e7eb">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div>
        <h2 style="font-size:22px;font-weight:800;color:#111827;margin:0">${r.reportId}</h2>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">${r.filename}</div>
      </div>
      <div style="text-align:right;min-width:160px">
        <div style="font-size:32px;font-weight:800;color:${scoreColor(r.score)}">${r.score}<span style="font-size:16px;font-weight:400;color:#6b7280">/100</span></div>
        <div style="margin-top:4px">${scoreBar(r.score)}</div>
      </div>
    </div>
    ${sections}
    <div style="text-align:right;margin-top:8px">
      <a href="#top" style="font-size:13px;color:#6b7280;text-decoration:none">↑ Back to summary</a>
    </div>
  </section>`;
}

function generateHtml(results: ReportResult[]): string {
  const generatedAt = new Date().toLocaleString();
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);

  const summaryTable = renderSummaryTable(results);
  const reportDetails = results
    .sort((a, b) => b.score - a.score)
    .map(renderReportDetail)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Investigation Report Scoring</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
  .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
</style>
</head>
<body>
<div class="container" id="top">

  <div style="margin-bottom:40px;padding-bottom:24px;border-bottom:2px solid #e5e7eb">
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <h1 style="font-size:28px;font-weight:800;color:#111827">Investigation Report Scoring</h1>
        <p style="color:#6b7280;margin-top:4px">${results.length} reports evaluated &nbsp;·&nbsp; Generated ${generatedAt}</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:14px;color:#6b7280">Portfolio Average</div>
        <div style="font-size:40px;font-weight:800;color:${scoreColor(avgScore)}">${avgScore}<span style="font-size:18px;font-weight:400;color:#9ca3af">/100</span></div>
      </div>
    </div>
  </div>

  ${summaryTable}

  <h2 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:24px">Report Details</h2>
  ${reportDetails}

</div>
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let files: string[];

  if (args.length > 0) {
    files = args;
  } else {
    const datasetDir = path.join(process.cwd(), "docs", "dataset");
    files = fs
      .readdirSync(datasetDir)
      .filter((f) => f.endsWith(".docx"))
      .map((f) => path.join(datasetDir, f));
  }

  if (files.length === 0) {
    console.error("No .docx files found.");
    process.exit(1);
  }

  console.log(`\nScoring ${files.length} report(s)...\n`);

  const results: ReportResult[] = [];

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const reportId = extractReportId(filename);
    console.log(`  → ${reportId} (${filename})`);

    try {
      const docText = await parseDocx(filePath);
      const evaluations = await evaluateReport(docText, reportId);
      const { score, sectionScores } = computeScores(evaluations);
      results.push({ filename, reportId, evaluations, score, sectionScores });
      console.log(`     Score: ${score}/100`);
    } catch (err) {
      console.error(`     ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (results.length === 0) {
    console.error("No reports were successfully evaluated.");
    process.exit(1);
  }

  const html = generateHtml(results);
  const outPath = path.join(process.cwd(), "scores.html");
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`\n✓ Report written to: ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
