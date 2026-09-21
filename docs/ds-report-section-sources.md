# Investigation Report DS — what draws each section

Which evidence feeds which section of MJ's SOP/QA/017-F01, for the ERF/26/022
rebuild. Written against the real section keys in
`src/lib/document-types/fir/sections.ts`.

Read with [`ds-report-instrument-data-plan.md`](ds-report-instrument-data-plan.md),
which covers how the instrument data gets in.

## The evidence

- **Event batch** — RIG25014 (22/05/2026), the excursion under investigation.
- **Historic batches** — RIG23001, RIG23008, RIG24003, RIG25010
  (Mar 2024 – Nov 2025). Same product, same lyophilizer.
- **Post-event batches** — C072630015/16/17 (29/05, 02/06, 07/06/2026), the
  three cycles after the event.
- **Specification** — Justification Report for LYO excursion Proposed Controls
  11.09.2026.docx p. 4 (per-step vacuum bands), plus the recipe header on p. 1
  of any trend print (`DRYING START P`, `ALARM:P1`, `ALARM:P2`).
- **Other attachments** — calibration certificate (vacuum transmitter),
  whatever else is linked to the report.

A saved time series cites **the analysis and the pages its rows came from**, so
anything drafted from one carries provenance without extra work.

## Section by section

| Section | Draws on | Supplies | Must come from elsewhere |
|---|---|---|---|
| `fir_event_description` | RIG25014 time series; recipe header p. 1 | Date, batch, equipment, parameter, observed value, acceptance limit, duration | Who detected it, how |
| `fir_standard_procedures` | Justification report p. 4; SOP | The acceptance criterion and the document that sets it, with revision | — |
| `fir_immediate_action` | — | — | What the operator did at the time |
| `fir_initial_impact` | RIG25014 time series (depth, duration) | The excursion as known when raised | The assessment made at the time — not backfilled |
| `fir_investigation_team` | — | — | Names and departments |
| `fir_investigation_tools` | — | — | Which of the seven tools were used |
| `fir_chronology` | RIG25014 time series | Instrument timeline: setpoint engaged, first out-of-band reading, minimum, recovery | Human actions and their clock times |
| `fir_investigation_details` | All eight time series; calibration certificate | What was examined and what the data showed | The reasoning |
| `fir_historic_review` | RIG23001 / 23008 / 24003 / 25010 | Date, batch, what happened, how long, how deep | **Event No., Root Cause, CAPA** per prior event — not in a trend print |
| `fir_root_cause` | All eight; recurrence pattern | Evidence for and against candidate causes | The causal determination; 6M classification |
| `fir_human_error` | — | — | The human-error evaluation |
| `fir_impact_assessment` | RIG25014 (depth/duration); C0726300xx (no recurrence) | Process impact evidence | Product testing, COA, yield |
| `fir_scope_assessment` | C072630015/16/17; all historic | Which batches show the same event | Which batches were released |
| `fir_batch_disposition` | — | — | The disposition decision |
| `fir_correction` … `fir_preventive_action` | Justification report (proposed controls) | Controls already proposed | The actions, owners, target dates |
| `fir_capa_effectiveness` | Historic batches (did prior CAPAs hold?); post-event batches | Recurrence evidence both sides of the event | Effectiveness criteria and duration |
| `fir_attachments` | — | — | The list; `checkAttachmentListConsistent` verifies it against every other section |

## What this means in practice

**Three sections are close to fully draftable** from the evidence:
`fir_event_description`, `fir_chronology`, `fir_standard_procedures`.

**Three are half-draftable** — the product supplies the data and a person
supplies the judgement: `fir_historic_review`, `fir_impact_assessment`,
`fir_scope_assessment`.

**The rest need a human or more attachments.** That is correct behaviour, not a
gap: MJ's block policy stops invented event numbers and CAPA references, and
the honest failure is an empty field rather than a plausible one.

**The binding constraint is the attachment set, not the model.** Historic
review cannot be completed from trend prints — it needs the prior deviation
records. Check with `list_attachments` before planning a drafting session.

## Known gaps in the plumbing

- **No `read_analysis` tool.** Document chat sees one summary line per saved
  time series (top 6 runs by severity) and can insert the figure. It cannot
  pull the full run list, so a 27-run batch is visible only in part.
- **`buildExcursionComparison` is written, tested, and called by nothing.** It
  produces exactly the one-row-per-run table `fir_historic_review` wants,
  across all eight batches. Wiring it to a `read_analysis` tool is the next
  piece of work.
