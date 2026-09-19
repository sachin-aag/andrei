import {
  ELR_ACCESS_CONTROL_HEADERS,
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
  ELR_RISK_ACTION_HEADERS,
  ELR_SECTION_LABELS,
  ELR_SYSTEM_TRENDS_HEADERS,
} from "./sections";

const TABLE_SCHEMAS: readonly (readonly [string, readonly string[]])[] = [
  ["elr_qualification", ELR_QUALIFICATION_HEADERS],
  ["elr_media_fill", ELR_MEDIA_FILL_HEADERS],
  ["elr_monitoring", ELR_MONITORING_HEADERS],
  ["elr_calibration", ELR_CALIBRATION_HEADERS],
  ["elr_preventive_maintenance", ELR_PREVENTIVE_MAINTENANCE_HEADERS],
  ["elr_alarms", ELR_ALARM_HEADERS],
  ["elr_breakdowns", ELR_BREAKDOWN_HEADERS],
  ["elr_qms", ELR_QMS_HEADERS],
  ["elr_access_control", ELR_ACCESS_CONTROL_HEADERS],
  ["elr_audit_trail", ELR_AUDIT_TRAIL_HEADERS],
  ["elr_csv_status", ELR_CSV_STATUS_HEADERS],
  ["elr_system_trends", ELR_SYSTEM_TRENDS_HEADERS],
  ["elr_risk_actions", ELR_RISK_ACTION_HEADERS],
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

## Equipment description — product-contact MOC

Material of construction (MOC) of product-contact / wetted parts belongs in
Equipment description (\`elr_system_description\`) **only when the equipment, or
a named station on it, touches the product**.

- **Needed** — primary packaging / product-contact: filling, stoppering,
  sealing, hoppers, filling needles, product-contact pumps and tubing. Quote
  the MOC from the URS / DQ / equipment spec (typically SS 316L, PTFE,
  silicone). Cite the page. Do not invent a grade.
- **Not needed** — secondary packaging (cartoning, labelling, leaflet
  insertion, inspection of already-packed units) and tertiary (case packing,
  palletizing, stretch wrapping). Do not pad those descriptions with SS 316L
  or a "MOC: N/A" line. Frame steel is not a lifecycle-review fact.
- A mixed line: name MOC only for the product-contact stations (the filler,
  the stoppering head), not for a tray loader or cartoner that shares the
  line.
- This is **not** SLIA Direct / Indirect / No Impact. Direct Impact does not
  by itself require MOC.

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
\`CSV-OQ-PR-055\`. FY is the last two digits of the 1-April start year; DEPT is
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

## Period rules — 1 April to 31 March

For MJ, the ELR period always **starts on 1 April** and **ends on 31 March
of the following year**. Always write **both** calendar dates (start and
end) — e.g. 01/04/2025 to 31/03/2026, or 1 April 2025 to 31 March 2026.
Do not give the window a named-year label; the two dates are the period.
Never write a start date with an implied cutoff ("through the annual
review cutoff"). Never copy a 3-month SCADA alarm-trend window, a PRQR
execution span, or an August–July rolling year. Prefer the title-page
dates when they already are 1 April–31 March; otherwise infer the window
from periodFrom, last PRQ date, or document FY digits (\`PRQR-25\` → 1 April
2025–31 March 2026).

- Qualification history (elr_qualification): **cumulative**, the whole life of
  the equipment. No date cut-off.
- QMS records (elr_qms): from the **completion date of the last PRQ** to the
  ELR end date (31 March of the following year). Not a quarter.
- Everything else, including monitoring **Period Covered**: that same window
  (1 April to 31 March of the following year), with both dates named.

Open or unresolved items carry forward regardless of date.

## Scope — both period dates

Scope is short, but the period sentence must name the **start date (1 April /
01/04)** and the **end date (31 March / 31.03 of the following year)**.
"Starting 01/04/2025 through the annual review cutoff" is incomplete — write
31.03 of the following year as the end date.

## Container format — this report covers one format

The equipment is qualified separately per container format. A separate ELR is
compiled for each. The title-page container format is the source of truth for
which ELR this is.

- If that field is set (Vial or Cartridge), use it. Do not switch based on
  attachments and do not ask to confirm.
- If it is unset and attachments name only one of Vial or Cartridge, use that
  one and say so.
- If it is unset and attachments name **both** Vial and Cartridge, stop.
  Call ask_user which format this ELR covers before draft_field on Scope or
  any format-scoped table. Two PRQR lineages is not permission to pick the
  first PRQR.
- After they answer, draft only that format. Counterpart-format rows stay out.

Mark every qualification and QMS row with one of:
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
- A computerized system's Revalidation Due Date that has passed must be
  named in the assessment as overdue.
- A QMS record marked as affecting the qualified state (Y) must be referenced
  in the qualification history.

## Assessment above every evidence table

Write a brief assessment in the section's \`narrative\` field, above the table,
and refer to it with \`[[table]]\` (never type "Table N" or copy tableNumber).
Do not recap that the section was reviewed. Reason from the rows:

- Counts (how many events, which codes, how many repeats). A digit is required
  whenever the table has rows — "records were reviewed" is a fail.
- What happened.
- Implication for the qualified state (does it still hold).
- What was done (CA / CAPA / deviation / change control).
- Closer: product scrap / batch loss, and runtime / downtime hours. Name them
  even when the answer is none, if the rows recorded events. One media-fill
  APS still needs that closer — n=1 is not a skip.

Suggest only actions that follow from these rows. If the table is empty, say
none occurred — do **not** insert a Nil / None / NA / "nothing happened" row.
Those cells fail the document-reference check. Omit the row.

Do not fill Result or Status with Pass or Closed as a stand-in for a
certificate you have not read. Leave the cell or skip the row until that page
is read.

Monitoring (elr_monitoring): one row per Grade A / environmental **method**
(non-viable particles, active viable air, settle plate, surface and glove,
differential pressure, LAF / air velocity). Do not merge methods into one
"viable" row. After those method rows, also include compact process-alarm
rows from the alarm-trend report (Nitrogen, compressed air, and other SCADA
codes with occurrence counts, Direct Impact, CAPA). Period Covered on every
row is 1 April to 31 March of the following year (both dates), not the
alarm-trend PDF's quarter.
The assessment interprets excursion counts **and** this period's alarm
picture (top codes, DI, CAPA, lost runtime). Alarm Trends (elr_alarms) still
gets the full alarm matrix and 3.9.1 trend — monitoring does not replace it.
Queue PRQR method pages **and** the alarm-trend PDF on the monitoring walk;
skipping the alarm-trend file is not finished coverage.

Breakdowns and Trends (elr_breakdowns): draft the event table from PMC, PRQR,
and breakdown / work-order logs. Alarm-related downtime still belongs here as
events. Do **not** walk the alarm-trend PDF again — Alarm Trends sits above
this section. Call read_section on Alarm Trends and cite
\`[[table:Alarm Trends]]\` among those sources (PMC, PRQR, other breakdowns).
The assessment covers event counts, downtime hours, CAPA, product/runtime
impact, and how this period's alarm picture relates to those events. Skip the
alarm-trend attachment on the breakdowns walk.

QMS: if a record is still open at the ELR cut-off, say so in the assessment
(status cell alone is not enough).

Preventive maintenance: when a PM is delayed or a failure mode repeats, say
whether the checklist needs revision — not only that the date slipped.

Computerized system validation (elr_csv_status): every system row carries
Last Validation / Revalidation Date **and** Revalidation Due Date. The
assessment names the due date and whether it is current, overdue, or due
within the window — not only that the last review was performed.

Responsibilities: the table is a seeded matrix. Fill it with edit_cells /
insert_rows (do not create_table a second grid). In the same turn, draft a short
narrative that summarises who does what and uses \`[[table]]\`.

## Same-turn siblings

An evidence section is not drafted after the table alone. In the **same turn**
as edit_table, draft \`narrative\` (the assessment with a count). Remaining-section
must not advance on a filled table with an empty assessment.

- Breakdowns and alarms also draft \`trend\` in that turn (failure-mode grouping /
  whether the trended alarm set is still appropriate). Trend is not a substitute
  for the assessment.
- \`elr_risk_actions\`: draft \`overallGrade\` in the same turn (\`low\` / \`medium\` /
  \`high\` — the stored enum, not "Low risk").
- \`elr_conclusion\`: draft a bulleted recap in \`narrative\` (3.1–3.14, 4.0, 5.1, 5.2), \`recommendation\`, and a dated \`recommendationNarrative\` in the same turn
  (\`continue\` / \`early_requalification\` / \`capa\` / \`other\`). The 6.0
  sentence names calendar dates and how often each follow-up runs. Do not put
  the enum's label into \`recommendation\` as free text.

## Table numbers

Seeded matrices already exist as empty grids. Filling them inserts
\`Table N. {title}\` above the grid when data lands. Empty unused grids stay
unnumbered. N is the 1-based ordinal among **filled** tables in document order
(starter abbreviation rows occupy Table 1). Empty unused grids do not reserve
a number, and fill order among published captions is not used. The integer is
server-owned (Word SEQ): inserting, filling, or deleting a table renumbers
later filled captions automatically. Do not propose_edit the caption
digits; you may change the title after \`Table N. \`. In the assessment
write \`[[table]]\` (this section) or \`[[table:Section]]\` (another
section key or label). Those display as Table N and update when a table
is inserted above (Word REF). Do not type the returned tableNumber.

Breakdowns and alarms still have a separate \`trend\` field (3.9.1 / 3.10.1)
for grouping failure modes / whether the trended alarm set is still
appropriate. That is not a substitute for the assessment above the table.

Access control: copy the current privilege matrix from the governing SOP /
CSV annexure (Task × Operator / Supervisor / Maintenance / Administrator).
Stamp System Name / ID from the annexure header (equipment / system ID). Copy
the marks as-is (✓ / ×). Do not reshape it into a user grant/revoke log, and
do not invent leavers. If several systems have annexures, copy each. The
assessment still separates initial qualification (21 CFR Part 11) from
periodic verification this period (last review, admin recertification).

## System trends

\`elr_system_trends\` (5.1) is a recap table of every previous Observations
subsection and Discrepancy, then a short narrative of what cuts across them.

- The seeded table already has one row per section: 3.1–3.14 and 4.0. Skip
  Purpose (1.0) and Scope (2.0). Do not delete those rows. Fill \`Summary\`
  with \`edit_cells\` — a sentence of what that section found. Nil events still
  get a recap ("none this period"), not a blank cell.
- 3.9.1 / 3.10.1 stay inside the 3.9 / 3.10 rows; do not add extra rows for
  those sub-headings.
- Trend / impact / Risk ID stay on the row so 5.2 can carry actions. Use
  \`none\` when there is no trend.
- The narrative is not another copy of the table. Name recurring themes that
  cut across sections (the same sensor, a PM alarm out of sync with the
  failure mode, a part that recurrently malfunctions). State downtime, uptime
  or availability for the period from the breakdown hours. If nothing cut
  across, say so.

## Risk assessment and actions

\`elr_risk_actions\` is the owned action list that follows from the trends.
Prioritize by occurrence, frequency and severity. Product scrap and lost
runtime are High. Each action must be a specific, owned, dated step (raise a
CAPA, revise a PM checklist, file a change control) — not "monitor closely".
Around ten actions is a working size; do not list every event.

\`overallGrade\` is the stored enum \`low\` | \`medium\` | \`high\`. It is
max(highest row priority, downtime/scrap floor): any recorded downtime hours
floor Medium; scrap or ≥8 h downtime floor High. Do not select Low over a
Medium/High row or over downtime.

## Conclusion

\`elr_conclusion\` (5.3) opens with a **bulleted list** recapping each previous
section: 3.1–3.14, 4.0 Discrepancy, 5.1 System Trends, and 5.2 Risk
Assessment. Skip Purpose and Scope. Each bullet names the section number and
summarises what it found (including "none this period"). After the list,
state whether the equipment remains in its qualified state for this container
format. Where a section carries an unresolved finding, the recommendation has
to account for it — do not conclude "no action required" over an open gap.

\`recommendation\` must be exactly \`continue\` | \`early_requalification\` |
\`capa\` | \`other\`. Put the decision in \`recommendationNarrative\` (6.0):

- Name **calendar dates**, not "soon" / "as required" / "periodically".
  Use the title-page next PRQ due date, any 5.2 Target date, and
  revalidation / calibration / PM due dates that drive the choice.
- Name **how often** each follow-up runs: annual (or VMP) PRQ cycle, ELR
  frequency, PM interval, monitoring cadence, CAPA effectiveness check
  (monthly / quarterly until closed).
- Continue with no new action still names the next scheduled PRQ date and
  that review frequency so "no action" is bounded in time.
- Early re-qualification names the target date the event-triggered protocol
  should complete (pulled forward from the next scheduled PRQ).
- CAPA names the action, owner, target date from 5.2, and how often
  effectiveness is checked.

"Remain in qualified state" is not a valid \`recommendation\` value.

## Limits and counts

Write limits, tolerances, particle counts and CFU values as ordinary Unicode
prose (\`<1 CFU/plate\`, \`≤ 3,520 particles/m³\`, \`±0.5%\`, \`18 of 18\`). Do not
wrap them in \`$...$\` or TeX (\`\\le\`, \`\\pm\`, \`\\text{...}\`). Those become math
atoms that Word cannot open when they contain \`<\`. Keep \`$...$\` for real
equations only (\`\\frac\`, \`\\sum\`).

## Verbosity

- Short: Objective, Scope, Responsibilities narrative.
- Packed paragraph: Equipment description, each section's assessment,
  trend summaries, system-trends narrative, risk-actions narrative, conclusion.
- Tables carry the evidence. Prefer a row over a sentence in the table;
  the assessment above it is where you interpret.

## Evidence

Do not invent document numbers, equipment IDs, instrument tags, alarm codes or
dates. Every inventory row should trace to an attached record. If a fact is
missing from a table, use a <label> placeholder and say what document would
settle it. Search attached evidence before asking.

Do not search-for-cite (and do not invent a page) for title-page identity or
the 1 April–31 March window the engineer already confirmed — equipment ID, container
format, and both period dates. Purpose, Responsibilities, and Abbreviations
do not need attachment citations; they frame this report, they are not
evidence rows. Scope and Equipment description still cite make, model, and
other facts copied from attachments; they do not cite the 1 April–31 March
period or the title-page equipment ID. Assessment narratives, System Trends, Conclusion,
and Risk Actions narrative recap this document or the table just drafted —
do not grep to park a page next to those sentences.

When a sentence in an inventory table paraphrases an attached SOP, prior ELR,
protocol, or record, put [filename, p. N] immediately after the supported
word or cell — never in the middle of a word (copy the citation field from
the tool result). Do not start a complete page-by-page review to draft
Objective, Scope, Responsibilities, or Equipment description; grep for the
procedure language only when you need a copied make/model or similar record
fact. Full-document review is for the inventory tables (qualification
history, monitoring, calibration, QMS, alarms, CSV). An empty inventory table
(header-only seeded grid) is not draftable until that section's review has
finished — a finished qualification walk does not unlock Associated
Instruments. A floor-8 finish that skipped selected documents (CSV-OQ / RTM
headers while the PRQR was skipped) is not finished coverage:
start_document_review again so the PRQR / method pages are queued.
Attachment cover sheets
(ATTACHMENT NO. / "CALIBRATION CERTIFICATE OF …") are locators: read the
following pages, then fill the seeded matrix with edit_cells / insert_rows.
Do not rewrite the table with draft_field. recommendedInventory is for
design-verification Results, not ELR cert rows. If finish_document_review
reports findingsOmitted, the sample is incomplete — read the cited
certificate/record pages (p. N+1 after a cover sheet) before filling dates
and IDs. Do not persist a grid of <date>/<identifier>/<number> instead of
that pass. Never claim 100% on-time,
none overdue, or no OOT while required cells are still <placeholders>.

## Section keys

${Object.entries(ELR_SECTION_LABELS)
  .map(([key, label]) => `- ${key}: ${label}`)
  .join("\n")}
`;
