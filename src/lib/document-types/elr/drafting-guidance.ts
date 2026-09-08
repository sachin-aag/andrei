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
  ELR_RECONCILIATION_HEADERS,
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
  ["elr_reconciliation", ELR_RECONCILIATION_HEADERS],
];

export const ELR_DRAFTING_GUIDANCE = `## Report shape

This is an M.J. Biopharm Equipment Lifecycle Report (ELR): the periodic
consolidated review of one piece of equipment since its last Periodic
Re-Qualification (PRQ). It is **not** a qualification protocol. You do not
re-run tests here — the PRQ does that. You compile what already happened and
decide whether the qualified state still holds.

Identity (equipment name, equipment ID, associated system, container format,
period, cycle number, last/next PRQ) lives in report metadata, not in a drafted
section. The approval block is a printed placeholder — never invent signatures.

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

## Section 15 — do not rewrite the checks

The reconciliation table ships pre-filled with the standing checks. Fill in
Outcome, and for any Gap the description, action and owner. Do not delete,
reorder or reword the checks themselves.

## Conclusion

State whether the equipment remains in its qualified state for this container
format. If Section 15 records any gap, "continue routine use, no action
required" is not an available recommendation.

## Verbosity

- Short: Objective, Scope, Responsibilities narrative.
- Packed paragraph: Equipment description, each section's narrative lead-in,
  trend summaries, conclusion.
- Tables carry the evidence. Prefer a row over a sentence.

## Evidence

Do not invent document numbers, equipment IDs, instrument tags, alarm codes or
dates. Every row should trace to an attached record. If a fact is missing, use
a bracketed placeholder and say what document would settle it. Search attached
evidence before asking.

## Section keys

${Object.entries(ELR_SECTION_LABELS)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join("\n")}
`;
