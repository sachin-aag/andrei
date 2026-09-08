import {
  ELR_ALARM_HEADERS,
  ELR_AUDIT_TRAIL_HEADERS,
  ELR_BREAKDOWN_HEADERS,
  ELR_CALIBRATION_HEADERS,
  ELR_CSV_STATUS_HEADERS,
  ELR_FORMAT_APPLICABILITY,
  ELR_MEDIA_FILL_HEADERS,
  ELR_MONITORING_HEADERS,
  ELR_PREVENTIVE_MAINTENANCE_HEADERS,
  ELR_QMS_HEADERS,
  ELR_QUALIFICATION_HEADERS,
  ELR_SECTION_LABELS,
} from "./sections";

const TABLE_SCHEMAS: readonly (readonly [string, readonly string[]])[] = [
  ["elr_qualification", ELR_QUALIFICATION_HEADERS],
  ["elr_media_fill", ELR_MEDIA_FILL_HEADERS],
  ["elr_monitoring", ELR_MONITORING_HEADERS],
  ["elr_calibration", ELR_CALIBRATION_HEADERS],
  ["elr_preventive_maintenance", ELR_PREVENTIVE_MAINTENANCE_HEADERS],
  ["elr_breakdowns", ELR_BREAKDOWN_HEADERS],
  ["elr_qms", ELR_QMS_HEADERS],
  ["elr_alarms", ELR_ALARM_HEADERS],
  ["elr_audit_trail", ELR_AUDIT_TRAIL_HEADERS],
  ["elr_csv_status", ELR_CSV_STATUS_HEADERS],
];

export const ELR_DRAFTING_GUIDANCE = `## Report shape

This is an M.J. Biopharm Equipment Lifecycle Report (ELR): the periodic
consolidated review of one piece of equipment since its last Periodic
Re-Qualification (PRQ). It is **not** a qualification protocol. You do not
re-run tests here — the PRQ does that. You compile what already happened and
decide whether the qualified state still holds.

Governing procedure: **SOP/DP/QA/014 Validation/Qualification Procedure R04**
(basis: EudraLex Vol. 4 Annex 15, WHO TRS 1019 Annexure 3, ISPE Vol. 5).

Identity (equipment name, equipment ID, associated system, container format,
period, cycle number, last/next PRQ) lives in report metadata, not in a drafted
section. The approval block is a printed placeholder — never invent signatures.

## Re-qualification: two different documents

- **Periodic Re-Qualification** (PRQP protocol / PRQR report, §7.17) — the
  scheduled cycle from the yearly planner (F16). Frequency comes from the
  Validation Master Plan. Half-yearly PRQ completes within ±15 working days of
  its schedule due date, yearly or longer within ±30 working days; outside that
  window needs a written justification (§7.17.13–7.17.16). The report approval
  date is the "done date", and the next due date runs from the original
  schedule, so the cycle does not drift (§7.17.17).
- **Performance Re-Qualification** (RQP / RQR, §7.18) — event-triggered by
  modification, major breakdown, design change, or relocation of non-movable
  equipment. Routed through change control.

Both use protocol format F09 and report format F10. Never label one as the
other in the qualification history.

Only **Direct Impact** systems carry periodic requalification (§7.1.5).
Indirect Impact and No Impact systems do not.

## Document numbering (§7.3)

\`<TYPE>-<FY>-<DEPT>-<NNN>\` — e.g. \`PRQP-25-PR-001\`, \`PQR-24-PR-042\`,
\`CSV-OQ-PR-055\`. FY is the last two digits of the financial year; DEPT is
QA / QC / MB / WH / EU / PR / PK / IT / PUR / EHS; NNN is a 3-digit serial.
Addenda append \`-AD01\`, \`-AD02\`. Equipment is \`E/PR/0NN\`; instruments hang off
the parent as \`E/PR/0NN/<type> <n>-NN\`. Never invent a number that does not
follow this shape.

## Sibling procedures to cite by number

Change control SOP/DP/QA/007 (CCF-…), deviations SOP/DP/QA/008, CAPA
SOP/DP/QA/009 (CPA-…), quality risk assessment SOP/DP/QA/010, computerized
system validation SOP/DP/QA/015, alarm categorization SOP/DP/QA/036.
Qualification discrepancies are raised on form SOP/DP/QA/014/F14 and graded
Minor / Major / Critical (§7.14.3).

## Period rules — different sections cover different windows

- Qualification history (elr_qualification): **cumulative**, the whole life of
  the equipment. No date cut-off.
- QMS records (elr_qms): from the **completion date of the last PRQ** to the
  ELR cut-off. Not the rolling window.
- Everything else: the rolling ELR period on the title page.

Open or unresolved items carry forward regardless of date.

## Container format — this report covers one format

The equipment is qualified separately per container format. A separate ELR is
compiled for each. Mark every qualification and QMS row with one of:
${ELR_FORMAT_APPLICABILITY.join(" | ")}

"Line-common" means the record belongs to the equipment or the line rather than
to one format; those rows appear in **both** format ELRs. Never copy a row that
belongs only to the counterpart format into this report.

## Table schemas (required GFM headers)

When drafting or editing a table, use exactly these headers:

${TABLE_SCHEMAS.map(([key, headers]) => `**${key}**\n${headers.join(" | ")}`).join("\n\n")}

## Cross-references are the point of the report

These pairings are checked. Draft them consistently:

- A monitoring excursion (Y) must carry a linked deviation reference.
- A calibration result of OOT must carry a linked deviation / CAPA.
- A delayed PM must carry a justification in Remarks.
- A repeat breakdown (Y) must carry a linked CAPA.
- A Direct Impact (DI) alarm must carry a remediation / action-plan reference
  or a deviation.
- An audit trail anomaly (Y) must carry a deviation reference.
- A computerized system changed since the last PRQ (Y) must carry a change
  control reference.
- A QMS record marked as affecting the qualified state (Y) must be referenced
  in the qualification history.

## Conclusion

State whether the equipment remains in its qualified state for this container
format. Where a section carries an unresolved finding, the recommendation has
to account for it — do not conclude "no action required" over an open gap.

## Verbosity

- Short: Objective, Scope, Responsibilities narrative.
- Packed paragraph: Equipment description, each section's narrative lead-in,
  trend summaries, conclusion.
- Tables carry the evidence. Prefer a row over a sentence.

## Evidence

Do not invent document numbers, equipment IDs, instrument tags, alarm codes or
dates. Every row should trace to an attached record. If a fact is missing, use
a <label> placeholder and say what document would settle it. Search attached
evidence before asking.

When a sentence paraphrases an attached SOP, prior ELR, protocol, or record,
put [filename, p. N] immediately after that sentence (copy the citation field
from the tool result). Objective and Scope stay short, but they still cite the
procedure page they rest on — the server converts those brackets to numbered
[n] markers and parks a Citations: list at the end of the field. Do not omit
citations because the section is short. Do not start a complete page-by-page
review to draft Objective, Scope, Responsibilities, or Equipment description;
grep for the procedure language instead. Full-document review is for the
inventory tables (qualification history, monitoring, calibration, QMS, alarms,
CSV).

## Section keys

${Object.entries(ELR_SECTION_LABELS)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join("\n")}
`;
