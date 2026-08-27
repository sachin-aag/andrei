import { QRA_FMEA_HEADERS, QRA_SECTION_LABELS } from "./sections";
import { QUALITATIVE_RUBRIC, QUANTITATIVE_RUBRIC } from "./scoring";

const QUANT_LINES = QUANTITATIVE_RUBRIC.map(
  (row) =>
    `- ${row.score}: S ${row.severity}; P ${row.probability}; D ${row.detectability}`
).join("\n");

const QUAL_LINES = (["low", "medium", "high"] as const)
  .map((level) => {
    const row = QUALITATIVE_RUBRIC[level];
    const label = level[0].toUpperCase() + level.slice(1);
    return `- ${label}: S ${row.severity}; P ${row.probability}; D ${row.detectability}`;
  })
  .join("\n");

export const QRA_DRAFTING_GUIDANCE = `## Report shape (SOP/DP/QA/010 R04, form F02)

This is an MJ Biopharm Quality Risk Assessment (ICH Q9), not a deviation
investigation and not a design-verification report. Draft F02 in section order.
F04 (new / residual risk) is a section of the same report.

Workspace labels have no form numbering. The Word template prints 1.1, 1.2, …

Identity (RA number, department, source document, product/process name) lives
in report metadata, not in a drafted section. Pre-approval and post-approval
signature blocks are printed placeholders — do not invent wet-ink names.

## Qualitative vs quantitative

Mode comes from three A02 yes/no answers (all yes → qualitative / informal;
any no → quantitative / formal). Do not mix 1–5 scores with Low/Medium/High
labels in the same grid.

## FMEA table (required GFM schema)

When drafting or editing the FMEA (or F04) table, use exactly these headers:

${QRA_FMEA_HEADERS.join(" | ")}

Risk IDs are stable: R01, R02, … They join mitigation and residual-risk rows.

## Scoring — never write RPN / RPR / Yes-No yourself

Fill Severity, Probability and Detectability only. Leave **RPN / RPR**,
**Risk Acceptable**, **Final RPN / RPR** and **Final Risk Acceptable** blank
(or unchanged). The engineer clicks Recalculate risk scores; the app writes
those cells from SOP/DP/QA/010 tables. Inventing an RPN is a defect.

Quantitative 1–5 (RPN = S×P×D; Low 1–8, Medium 9–24, High 25–125):
${QUANT_LINES}

Qualitative Low / Medium / High (lookup, not a product):
${QUAL_LINES}

Detectability High (qualitative) or 5 (quantitative) means **no detection
possible** — worse, not better.

Medium and High require a mitigation plan, responsible person, and target
completion date. High must be mitigated before the activity proceeds. Low
needs no mitigation.

## Verbosity

- Short: Approach (the three A02 answers plus one sentence), Procedure
  (point to the A01 flow), Periodic review (Yes/No + justification).
- Packed paragraph: Objective, Scope, Overview, both conclusions.
- Tables: Team, identification, FMEA, communication, mitigation closure,
  residual risk, revision history.

## Evidence

Do not invent batch numbers, equipment IDs, or failure modes. If a fact is
missing, use a bracketed placeholder. Search attached evidence before asking.

## Section keys

${Object.entries(QRA_SECTION_LABELS)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join("\n")}
`;
