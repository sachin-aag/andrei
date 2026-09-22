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

All eight prints are the same product (r-Insulin glargine) on the same
lyophilizer (L-1901), which is what makes the historic and scope comparisons
legitimate.

## Draftability

Buckets are the share of the section's *required fields* the attachments can
fill, not a confidence score. `fir_historic_review` sits at ~40% because the
prints supply the batch-comparison table but none of the prescribed event
columns — not because the model is 40% sure.

Calibrated against the finished report
(`docs/sample_files/Investigation report_ERF-26-022 11.09.2026.docx`), which is
deliberately **not** in the attachment set. The last column is what that report
states with no attachment behind it.

Also published as a sheet:
[Section Draftability vs Attachments](https://docs.google.com/spreadsheets/d/17Vj9-0KUQ2zm7t3xjHPMRhQNfjl_oSPur7o5z9tnnxo/edit).

| Section | Draftable? | Citations to refer | In ERF/26/022 but in no attachment |
|---|---|---|---|
| Description of Event | **Yes ~80%** | RIG25014 p. 1 (product, batch, L-1901, operator, batch start/stop); RIG25014 time series (20:59:11–21:06:11, min 192.40 µbar); JR p. 4 | Reporter (Mr. Shrinath Yeotikar); "routine batch monitoring"; NC raise date 23/05/2026; ERF/26/022 itself |
| Standard Procedures | **Partial ~60%** | RIG25014 p. 1 recipe header (`DRYING START P` 800 µbar, `ALARM:P1` 900, `ALARM:P2` 950, `P2 DURATION` 300 s); JR p. 4 (6-step band table) | GR/25/005–R00 PCS report; ERF/25/146 as the basis for the range change; BMR-100-RIGC3-01; the superseded 1000–200 µbar range; CPP designation |
| Immediate Action Taken | **No** | — | Auto-valve checks YV-3106/3107/3108; the needle-valve adjustment and who made it |
| Initial Impact Assessment | **Partial ~25%** | RIG25014 time series (depth, duration at the time of raising) | The assessment actually made at the time |
| Investigation Team | **No** | — | Sachin Kumbhar, Gaurav Shelar, Harshdeep Thakkar, Akash Kengar + departments |
| Investigation Tools Assigned | **No** | — | "Documents review and Why-Why Analysis" |
| Chronology of the Event | **Yes ~80%** | RIG25014 p. 1 recipe header (shelf −5 °C; freezing −45 °C ramp 120 / soak 60; condenser −50 °C soak 5; pre-evacuation 800/900/950 µbar, 300 s; PD Step 1 −45 °C ramp 2 / soak 60 / 800 µbar); RIG25014 time series | Reporting and by whom; escalation to QA and Head of Production |
| Investigation Details | **Partial ~35%** | RIG25014 time series (Figure-01 and post-primary-drying Figure-02); all 8 time series; calibration certificate PE-0251 | N₂ regulator ~1 bar; YV3011 and auto-valve inspection; needle-valve physical check; vibration check; 24/05/2026 post-batch check; BMR §7.16.31 review; SOP/P1/189, /180, /161, SOP/EU/063; PM records; training records; the EV-valve ON/OFF rationale |
| Historic Review | **Partial ~40%** | Batch-comparison table fully computable: RIG23001, RIG23008, RIG24003, RIG25010 (+ RIG25014, C072630015/16/17) — setpoint, range, observed, detail, start/end, duration, direction | The whole prescribed event table: ERF/25/135 (RIG25008), ERF/25/146 (RIG25009), ERF/25/186 (RHI25063) — **none of those batches has a trend print in the set** |
| Root Cause / Probable Cause | **Partial ~20%** | All 8 time series (recurrence at phase transitions; setpoint-step vs true excursion); calibration certificate | The determination; Why-Why Q1–Q7; contributing factors; absence of closed-loop control; 6M group |
| Human Error Evaluation | **No** | — | The evaluation and its "not operator error" conclusion |
| Impact Assessment | **Partial ~25%** | RIG25014 time series; TT1–TT6 shelf/product temperature columns in RIG25014; C072630015/16/17 time series | The interim COA (HMWP 0.21 %, LOD 4.09 %, Assay 101.3 %, HCP 2 ppm, endotoxin <10 EU/mg, Host Cell DNA under testing); the sublimation-impact judgement |
| Scope Assessment | **Yes ~75%** | All 8 prints p. 1 (same product, same L-1901); all 8 time series (no comparable Step 1 excursion in C072630015/16/17) | Release status; the "recurring system behaviour" judgement |
| Batch Disposition | **No** | — | The decision — ERF/26/022 omits it entirely |
| Correction Details | **Partial ~15%** | RIG25014 time series (recovery into 650–950) | The adjustment to ~800 µbar, who performed it, the work order |
| Corrective Action | **Partial ~15%** | RIG25014 time series (recovery evidence) | Action text, owners, target dates, change-control numbers |
| Interim Control | **Partial ~40%** | JR (20-minute stabilisation allowance; monitoring and escalation table) | Approval, owner, effective dates |
| Preventive Action | **Partial ~45%** | JR (study protocol, optimum valve position, alarm challenge, training module, one-page lesson, band table) | MKS PID valve evaluation; BMR §7.16.31 revision; FMEA and PCS Table 4 update; change-control numbers |
| CAPA Effectiveness Check | **Partial ~25%** | RIG23001/23008/24003/25010 time series; C072630015/16/17 time series | Criteria, duration, responsibility — ERF/26/022 has no effectiveness table at all |
| Attachments | **Partial ~70%** | The linked attachment set itself | Document Reference Nos. |

Roughly: **3 sections drafting-complete, 12 partial, 5 blocked.** Nothing here is
blocked by model capability — every "No" is a record that isn't in the
attachment set.

## Two mismatches worth knowing

**The report's own attachment list does not match the trend prints we hold.**
ERF/26/022 lists batch trend reports for RIG25009, RIG25010, RIG25013,
RIG25014, C072630015 (twice), C072630016, C072630017. The set we hold is
RIG23001, RIG23008, RIG24003, RIG25010, RIG25014, C072630015/16/17 — so
RIG25009 and RIG25013 are missing, and RIG23001 / RIG23008 / RIG24003 are
cited in the report's historical batch table without appearing in its
attachment list.

**Historic Review is two different tables in one section.** The prescribed R01
table is about prior *deviations* (ERF/25/135, ERF/25/146, ERF/25/186 — batches
RIG25008, RIG25009, RHI25063). The table ERF/26/022 actually filled is a
*batch* comparison over the eight trend prints. Our time series compute the
second exactly and the first not at all, which is why the bucket is ~40% rather
than either 0 or 100.

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
