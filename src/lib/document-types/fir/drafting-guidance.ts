import {
  FIR_ACTION_HEADERS,
  FIR_ATTACHMENT_HEADERS,
  FIR_BATCH_DISPOSITION_LABELS,
  FIR_CAPA_EFFECTIVENESS_HEADERS,
  FIR_CHRONOLOGY_HEADERS,
  FIR_HISTORIC_REVIEW_HEADERS,
  FIR_HUMAN_ERROR_HEADERS,
  FIR_INVESTIGATION_TOOL_LABELS,
  FIR_ROOT_CAUSE_CLASSIFICATION_LABELS,
  FIR_ROOT_CAUSE_GROUP_LABELS,
  FIR_TEAM_HEADERS,
} from "./sections";

function columns(headers: readonly string[]): string {
  return headers.map((h) => `\`${h}\``).join(" | ");
}

function options(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([id, label]) => `\`${id}\` (${label})`)
    .join(", ");
}

export const FIR_DRAFTING_GUIDANCE = `## Report shape (SOP/QA/017 R08, form F01 R01)

This is M.J. Biopharm Investigation Report DS — the Drug Substance unit
investigation. It is a different form from Investigation Report DP
(SOP/DP/QA/008, Drug Product, DMAIC), which MJ also runs. Never introduce Define / Measure / Analyze / Improve / Control
headings here, and never reach for 6M or 5-Why as section structure — 6M appears
only as the root cause identification group, and 5-Why only if it is one of the
investigation tools selected.

Identity (unit, date of non-conformance, source document no., product, batch,
equipment ID) lives in report metadata, not in a drafted section. The approval
row is a printed placeholder — do not invent wet-ink names or dates.

Workspace labels carry no form numbering. The Word template prints the numbering.

## Fixed selections

These are picked from fixed lists, never written as prose:

- Investigation tools: ${options(FIR_INVESTIGATION_TOOL_LABELS)}. Anything not on
  this list goes in Other tools; it does not replace a selection.
- Root cause classification: ${options(FIR_ROOT_CAUSE_CLASSIFICATION_LABELS)}.
- Root cause identification group: ${options(FIR_ROOT_CAUSE_GROUP_LABELS)}. More
  than one may apply. \`no_root_cause\` cannot be combined with another group.
- Batch disposition: ${options(FIR_BATCH_DISPOSITION_LABELS)}. Always recorded.
- Impact assessment results status: \`final\` or \`interim\`.

## Table column schemas

Use these columns exactly; they match the Word template.

- Investigation Team: ${columns(FIR_TEAM_HEADERS)}
- Chronology: ${columns(FIR_CHRONOLOGY_HEADERS)} (no time column — put the
  clock time in the observation text, as MJ's own reports do)
- Historical Data Compilation: ${columns(FIR_HISTORIC_REVIEW_HEADERS)}
- Human Error Evaluation: ${columns(FIR_HUMAN_ERROR_HEADERS)}
- Corrective / Interim / Preventive Action: ${columns(FIR_ACTION_HEADERS)}
- CAPA Effectiveness Check: ${columns(FIR_CAPA_EFFECTIVENESS_HEADERS)}
- List of Attachments: ${columns(FIR_ATTACHMENT_HEADERS)}

## Drafting rules that this form enforces

**State a quantity once.** Pick one convention for the duration of an event —
elapsed time, or number of readings — and use it in the description, the
chronology, the historic table and any attachment. Two figures for the same
window is a defect the checks will flag.

**Give numbers, not adjectives.** "Shelf temperature remained within range" is
not evidence. "Shelf held -44.8 to -46.2 °C against a -45 °C setpoint" is. Every
impact claim names the value and the acceptance criterion, and cites the record.

**Separate correction from corrective action.** The correction fixes this
occurrence. The corrective action stops the cause recurring. They are different
fields; do not put the same text in both.

**Own and date every action.** Each row in the three action tables needs a
responsibility and a real target completion date. "Soon", "as required",
"ongoing" and "TBD" are not dates.

**An open action needs an interim control.** If corrective or preventive actions
have future target dates, record what covers the interval — or state explicitly
that no interim control is required.

**Effectiveness checks need a criterion and a duration.** "Monitor the trend" is
not a check. "No Step-1 vacuum excursion in the next 10 batches, reviewed at 6
months" is.

**Historic review is one row per prior event**, each with its own date, event
number and batch number. Then say whether those CAPAs held. If prior events
share this event's root cause group, the report has to address recurrence — a
repeat finding on the same equipment is not a routine single event.

**Interim means interim.** If any test supporting the impact assessment is still
in progress, set the results status to \`interim\` and say which test is pending.
Do not conclude "no adverse impact" on incomplete data and describe it as final.

**Name the unmeasured.** Where the causal chain depends on a quantity nobody
measured — a flow that has no transmitter, a position with no readback — say so
in the investigation details. An inferred link presented as an established one
is the deficiency an inspector will find.

**Detection is part of prevention.** If a person caught the event rather than the
system, ask what would have caught it automatically. Preventive actions that are
only training and documentation leave detectability unchanged.`;
