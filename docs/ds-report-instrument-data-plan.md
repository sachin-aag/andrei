# Investigation Report DS — instrument data, analysis, and figures

Living plan. Update it whenever a phase lands or a locked decision changes.
Architecture that disagrees with code loses — fix this file.

Status: **Phases 1–5 landed** on `feat/IR_DS`. What is left is verification
against a live environment, not construction — see *Before MJ sees this* below.

## What this is

The chain that has to exist before an engineer can upload MJ's lyophilizer
attachments and get ERF/26/022 out of the product: parse instrument prints into
typed rows, detect out-of-band runs, plot a time series, and let the resulting
numbers survive the grounding gate.

The document type itself (sections, criteria, deterministic checks, Word
template) is finished and documented in `CLAUDE.md` — that is not this file.

Related:

- [`agent-generated-charts-plan.md`](agent-generated-charts-plan.md) — the
  precedent for generating pixels. Marked "not started" but shipped; the
  derivability principle in it is load-bearing for Phase 4 below.
- [`document-ingest-pipeline.md`](document-ingest-pipeline.md) — the extract
  path Phase 1 hooks into.
- [`retrieval.md`](retrieval.md) — why search cannot serve this data.

## Why retrieval cannot solve this

The trend prints are 70–84 pages of `DATE TIME TT1..TT6 VAC1 VAC2 PT1` at
one-minute sampling. Vector search is degenerate across them — every page
embeds to nearly the same point — and FTS on `192.4` is noise. There is nothing
to rank on.

They are also born-digital, so `extract-batch.ts` already takes the
`readPdfTextLayer` path and `document_pages.transcript` holds the exact PDF
characters. **The numbers are already in the database, verbatim, as prose.**
The gap is that nothing turns them back into data.

`extract_numeric_series` is not the answer: it caps at 6 pages and one metric
per call, and runs an LLM over transcript text we already have exactly. One
76-page batch needs ~13 sequential calls for one channel, and the excursion
analysis needs two channels across eight batches.

## The oracle

Derived independently during the ERF/26/022 review and confirmed twice — once
by ad-hoc regex parse, once by the committed parser. **Treat disagreement as a
defect in the code, not in this table.** A future agent cannot re-derive these
without the source prints, which are gitignored.

| Batch | Band | Window | Readings | Elapsed | Extreme |
|---|---|---|---|---|---|
| RIG25014 | 650–950 | 22/05/2026 20:59:11 → 21:06:11 | 8 | 7 min | 192.4 low |
| RIG23008 | 650–950 | 20/04/2024 18:54:02 → 19:11:02 | 18 | 17 min | 201.3 low |
| RIG23001 | 380–620 | 22/03/2024 10:08 → 11:48 | 101 | 100 min | 844.1 high |
| RIG24003 | 200–600 | 12/05/2024 11:04 → 12:49 | 106 | 105 min | 191.6 low |
| C072630015 | 480–720 | 29/05/2026 22:27 → 23:38 | 24 (separate) | — | 755.3 high |
| RIG25010 | — | 17/11/2025 cycle | 0 | — | clean (see trap below) |

Also: RIG25014 has **exactly one** out-of-band run in its whole cycle;
C072630015/16/17 have **none** at the 800 µbar setpoint.

Conditional bands, from the recipe: `800 → 650–950`, `600 → 480–720`,
`500 → 380–620`, `250 → 200–600`. All eight prints share one recipe, so the
mapping is constant across them.

**The band is not a column.** The data table is
`DATE TIME TT1..TT6 VAC1 VAC2 PT1` — eleven columns, no setpoint among them.
The schedule lives in the recipe block at the top of the print, as prose. So
`ConditionalSpec` (which selects a band by another *column's* value) does not
apply to these prints: analyse one drying phase at a time with a fixed band and
a row range. The conditional shape still earns its place for stability
timepoints and multi-grade lines, where the selector really is a column.

**Trap — a setpoint step reads as a 121-minute excursion.** Judging RIG25010's
whole cycle against 650–950 reports a 122-reading run down to 543.9. It is not
an excursion: at 01:20 the vacuum is at 752 holding near 800, at 01:21 it steps
to 584, and it then holds 590–620 for two hours — the 600 setpoint, whose band
is 480–720, containing every one of those readings. Contrast RIG25014, which
fell to 192.4 and recovered within eight readings while its neighbours sat near
800. **A run that holds steady at its new level is a step; a run that departs
and returns is an excursion.** Any test that applies one band across a whole
cycle will manufacture this finding.

### Staging the prints

Oracle tests in `table-extract.test.ts` and `excursions.test.ts` are
`describe.skipIf(...)` on `/tmp/trend/<BATCH>.txt` — whole-document text, split
on the repeating `M. J. BIOPHARM Pvt. Ltd.` header to synthesise pages. They
**skip silently** when absent, so a regression can pass CI unnoticed. Either
stage them from a private bucket in CI, or add a guard that fails when the
fixture directory is missing under `FULL_FIXTURES=1`.

## Landed

### Phase 1.1 — `src/lib/attachments/table-extract.ts`

Grammar-based table recovery. A data row is recognised by the *shape* of its
cells (date / time / number / text); the dominant repeating shape is the table
body. Nothing in it is instrument-specific.

Validated on all eight prints: 613 pages, ~15,900 rows, identical signature
`date|time|value x9`, headers recovered past the units line, row counts equal to
an independent parse.

**Locked decision — value cells group loosely.** Grouping on the raw shape put
any row containing a marker (`OOT`, `N/A`, `<LOQ`, `---`) into its own
signature and dropped it, which loses precisely the readings an investigator
needs. `groupClass` therefore collapses number and text into one `value` class
and keeps date/time structural. Do not "tighten" this.

**Locked decision — a mixed column types as text.** One non-numeric cell
demotes the whole column rather than the outlier being silently dropped.

**Locked decision — a data row is at least half numeric or temporal**
(`DATA_CELL_RATIO`). A running footer such as "Requirements Document Template,
731-00003 Rev. A Page 1 of 49" repeats on every page and carries two numbers, so
a bare has-a-number test read it as a 49-row table and would have written page
furniture into `document_tables`. Keep the regression test if you touch
`isDataShape`.

### Phase 2.1 / 2.2 — `src/lib/statistical-analysis/excursions.ts`

Contiguous out-of-band runs with start, end, reading count, elapsed time,
extremes, direction and source pages.

**Locked decision — limits are conditional.** `ConditionalSpec` selects the band
per row from another column's value. The vacuum band depends on the recorded
setpoint; the same shape covers stability timepoints and multi-grade lines.
Selector comparison is numeric-aware so `800` and `800.0` match.

**Locked decision — a band change splits a run.** Merging across a setpoint
change would report a duration against limits that were not in force for all of
it.

**Locked decision — readings and elapsed minutes are separate fields.** Eight
readings one minute apart span seven minutes. Conflating them is what produced
four different durations for one excursion in ERF/26/022 (`08 min`,
`087 min elapsed`, `87 Minutes`, `7 min`). Never derive one from the other
implicitly.

### Phase 1.2 — `document_tables` / `document_table_rows`

Schema in `src/db/schema/index.ts`, migration `0066`, persistence in
`src/lib/attachments/persist-document-tables.ts`, reads in
`src/lib/attachments/document-tables.ts`.

**Locked decision — detection runs over stored transcripts, not the PDF.** The
original plan was to gate on `textLayer.usable`, and that would have been the
bug the check script warned about: `usable` requires *every* page to clear 180
characters, so one thin divider page in an 80-page print flips the whole
document to the vision path and the parser never runs. But
`extractMixedPagesWithDocumentAi` keeps the verbatim text layer for every
born-digital page even in a mixed document, so `document_pages.transcript` is
already exact per page. Detecting from there is both more robust and cheaper —
no second read of the PDF. **Do not re-gate this on `usable`.**

Reads are scoped to `report_attachments.active_ingest_run_id`. A re-ingest
leaves the old run's tables in place, and offering both would hand the engineer
two copies of the same series.

Budgets: 20,000 rows per table, 10 tables and 60,000 rows per run. A table that
straddles the run budget is kept in part and flagged `truncated` rather than
dropped — a partial series is still evidence.

### Phase 1.3 — `load_table`

Analytics chat tool. No arguments lists the parsed tables; a `tableId` loads one
onto a sheet with `rowStart` / `rowLimit` paging against `MAX_WORKSHEET_ROWS`
(10,000). Row page numbers become column citations, so a loaded column cites its
source exactly as a read-and-write dump does.

Three wiring points that are easy to miss, all covered by tests:

- `load_table` counts as a **dump source** in `search-loop.ts`. Without that the
  "you greped but read nothing" guard hides the plot tools after a load, and the
  turn stalls waiting for a page read that would add nothing.
- Two listings without a load hides the tool (`analyticsLoadTableDirective`). A
  model that keeps listing will not start loading on the third try.
- Sheet workers do not get it. Table selection is the orchestrator's job; a
  worker loading a parsed table creates a second tab holding the data it was
  sent to dump.

**Batch loading is one call, not subagents.** `loadAll` (or `tableIds`) writes
one sheet per file in a *single* worksheet write. Per-table calls would be the
obvious shape and the wrong one: each takes the mutation lock and persists the
whole workbook, which grows with every table — eight 2,000-row instrument
tables means nine cumulative writes of up to ~2 MB, plus version-conflict
retries if the model fires them in parallel.

Subagents are also the wrong shape here, even though `extract_sheet` uses them.
A worker exists to run an LLM over pages; `load_table` runs no model at all, so
spinning up eight of them would be slower and costlier than eight direct reads
— and this is one read.

### Phase 1.4 — ingest at volume

Interior pages of a table spanning 8+ pages are skipped by chunk + embed
(`interiorTablePages`). The first and last page of each span stay chunked so the
document is still findable; the 74 identical pages between them cost nothing.
`read_document_page` still serves every page, and the rows are in
`document_tables` verbatim, so nothing becomes unreachable.

### Phase 2.3 / 3 — the `time_series` analysis kind

**Locked decision — 2.3 and 3 are one kind, not two.** The plan had excursions
as a saved analysis and the plot as a separate kind. They are two views of one
computation, and splitting them would mean two `sourceHash` definitions that
could disagree about the same rows. `computeTimeSeries` returns the points, the
band segments, *and* the detected runs; the view draws the figure above the
excursion table.

Full CRUD in `store.ts` (create / recompute / update), staleness in `stale.ts`,
CSV and XLSX download, `plot_time_series` in Analytics chat, and registration in
`WORKSHEET_PLOT_CATALOG` so Plot and Analyze-data cannot drift.

- **Excursions survive decimation.** A saved series caps at
  `MAX_TIME_SERIES_POINTS` (4,000); every out-of-band reading and its immediate
  neighbours are kept, with a uniform stride for the rest. A figure that lost the
  excursion would be worse than no figure. Asserted by test.
- **The band is drawn per segment.** A conditional band steps when the setpoint
  does, so shading is one rect per run of the condition column rather than one
  pair of lines across the cycle.
- **`ChartLimits` holds one pair, so a stepped band leaves it empty**
  (`showSpecLimits: false` on the spec). Drawing the first band across the whole
  cycle would assert limits that were not in force. The stepped band lives in
  `bandSegments` and is what the time-series view draws.
- **Excursion shading matches on worksheet row, not the printed label.** A clock
  repeats every day; a label lookup shades the wrong stretch of a multi-day
  cycle. This was found by a test helper that generated `120:00:11` — worth
  keeping in mind that the oracle prints are single-cycle and would not have
  caught it.
- `ChartLayout.xTickFormat: "time"` is presentation only — geometry is unchanged,
  `x` stays epoch milliseconds, and `formatTimeAxisTick` picks resolution from
  the span. It reads UTC deliberately: instrument stamps are wall-clock
  readings, not zoned instants, and localising them would move an excursion.
- The source figure's `00:13:39 / −192.1` cursor readout is the excursion
  duration and depth. It is computed, not placed by hand.

**Column roles are inferred, not asked for.** `column-roles.ts` classifies each
worksheet column from its cells — timestamp / date / clock / measurement /
setpoint / category / label — so `plot_time_series` takes the engineer's own
words ("plot the chamber vacuum over time") and works the four columns out.

The discriminator worth knowing: **a setpoint is numeric but takes a handful of
values and holds each one**, while a measurement varies nearly every row. That
is what separates VAC2 (0 / 250 / 500 / 600 / 800) from VAC1 without knowing
anything about lyophilizers, and the same shape covers a stability timepoint or
a product grade. A measurement is paired with the setpoint sharing its name
stem (VAC1 ↔ VAC2), not merely the nearest column — TT1 is closer to VAC1 by
index and is the wrong band.

**The measurement is never guessed when several fit and none was named.**
Plotting one of nine instrument channels at random is worse than listing them.

**Acceptance limits are never inferred — and "no band" is never a pass.**
A band is a specification; deriving one from the data would be inventing the
criterion the data is judged against. `judgedReadings` counts the readings that
had a band in force, and when it is zero the figure, the CSV, the XLSX, the
chat result and the Document-chat context line all say *excursions were not
assessed* rather than *no excursions*. That distinction is the whole point: the
first is a gap, the second is a compliance claim, and they are one careless
sentence apart in a regulated document. A band with neither limit set counts as
no band.

Where the limits actually come from, for this investigation: the trend print's
own header carries `DRYING START P : 800 uBAR`, `ALARM:P1 : 900`, `ALARM:P2 :
950`, so 950 is citable from page 1. The rest are in **Justification Report for
LYO excursion Proposed Controls 11.09.2026.docx, p. 4**, which states them as
setpoint ± controlling band — 800 ±150, 600 ±120, 500 ±120 — confirming the
oracle from a source rather than from my reconstruction.

**That document also gives an overall operating range of 200–1000 µbar, and
that is the trap.** Judged against it, a whole cycle passes: RIG23001's hundred
minutes at 844 µbar during a 380–620 step sits comfortably inside 200–1000. An
overall range and a per-step range are different tests, and the weaker one
reports a clean pass.

`steppedSetpointWarning` detects it from the data — a fixed band on a series
whose setpoint column takes several values — and the chat result carries
`fixedBandOverSteppedSetpoint` so the assistant has to say which test it ran.
It is a warning, not a refusal: the overall range is a real criterion, just not
a sufficient one.

**The gather guard hid the plot tools from a legitimate spec lookup.** Asked to
plot a time series, the assistant greped for the acceptance limits — correct —
and `analyticsDumpReadinessDirective` read a cited search with no page read yet
as "still gathering", which hides `PLOT_TOOLS`. Never offered the tool, the
model truthfully reported that timestamp-based time series are not supported at
all. Confirmed in Langfuse: the turn ran `search_documents → read_worksheet →
document_outline → read_document_page` and never attempted the plot.

`prepareAnalyticsChatStep` now takes `worksheetHasData`, set from the report
rather than the turn: a sheet filled on an earlier turn is still filled, and
searching for the *specification* is not gathering data. Intent classification
was never the problem — "lets plot a time series" is `produce_request`/write.

**Inference must run even when the model names columns.** The first version
skipped it whenever `columnId` and `timeColumnId` were both given — and the
model reads the worksheet and names those two almost every time. The column it
never names is the setpoint, which is exactly the one worth working out. Seen
in Langfuse: `plot_time_series` called with `columnId`, `timeColumnId`,
`clockColumnId` and nothing else, `conditionColumnName: null`, 2,022 readings,
`judgedReadings: 0`. Inference now fills whatever was left out.

**A warning has to say what to do next.** "No acceptance limits were in force"
is true and useless. It now names the steps: *this series steps through VAC2 =
250, 500, 600, 800, so it needs one band per step — find those ranges in the
attachments and re-run with conditionColumnId and bands.* `detectSetpointColumn`
is deliberately separate from `steppedSetpointWarning` so it can fire when
there is no band at all, not only when there is a wrong one.

**A band that cannot fail is caught.** The first real run supplied
`VAC2 = 0 → 0–1050`, a band for the freezing phase where the equipment is not
controlling to any vacuum setpoint. It judged ~600 idle readings against limits
that excluded nothing. `suspectBands` flags two shapes no genuine criterion
has: a band keyed to an **off** setpoint (`0`, `off`, `idle`), and a band whose
limits sit outside **every reading in the whole series** — `0–1050` against a
series spanning 235.5–1000 is a catch-all, not a limit.

Deliberately *not* flagged: a band that simply had no excursions. A compliant
step is supposed to look like that, and warning about it would train people to
ignore the warning.

**Bands belong to the column, not to each plot.** `WorksheetSpecRow` carries
`conditionColumnName` + `bands` beside the existing LSL/USL, and specs are
workbook-global keyed by column name — so limits stated once for VAC1 apply to
every batch sheet that has a VAC1. A plot supplied with bands saves them; a
plot without them inherits them. Eight batches, one statement of the
specification, one chance to get it wrong instead of eight.

The condition column is resolved by name **on the measurement's own sheet**,
because each batch sheet has its own VAC2.

**Whether a column needs bands at all is a data question, not a template
one.** A measurement paired with a stepping setpoint column needs them;
everything else is served by plain LSL/USL. `detectSetpointColumn` already
answers it, so no template registry is required and other document types never
see this machinery.

A related bug the test for this found: `suggestTimeSeriesColumns` could pick
the **measurement itself** as its condition column. A flat channel classifies
as a setpoint and trivially shares its own name stem, so it would have been
selected to set the limits it was judged against.

**Still open on this kind:** *Export with Excel charts* routes through the
`ChartSpec` path, so a time series exports as an XY chart with numeric (epoch)
x values rather than a native Excel date axis. The data tabs and the excursion
table are correct; the chart's x labels are not yet dates. Converting means
writing the x column as an Excel serial (`ms / 86_400_000 + 25569`) with a date
`numFmt` in `excel-chart-source.ts`.

## Pending

### Phase 4 — computed facts and the grounding gate

**The premise in this plan was wrong, and the truth was worse.** It said
derived values like *"8 consecutive readings"* and *"7 minutes elapsed"* would
be blocked under MJ's `unsupportedFactPolicy: "block"`. They were not — because
`extractHardFacts` did not recognise them as facts **at all**. Nor did it
recognise `192.4 µbar`, `802.4 mbar`, `1.33`, `105 minutes` or `00:13:39`.

So the gate was not too strict about instrument quantities. **It was blind to
them.** A model could write any vacuum figure, any excursion duration, any
capability index, and nothing checked it. On the one document type made
entirely of those numbers, the gate did nothing.

Phase 4 therefore had to do two things at once, and neither is safe alone:

1. **Teach the extractor the quantities.** `claim-facts.ts` now recognises
   minutes and seconds, `HH:MM:SS` clock deltas (how an instrument cursor
   reports a duration), and instrument units — µbar / mbar / bar / kPa / Pa /
   psi / mmHg / torr / rpm / Hz / lpm / µm / mm / ppm / µS·cm⁻¹ alongside the
   lab units already there.
2. **Give legitimate derived values a source.** `analysis-evidence.ts` turns a
   saved analysis into citable evidence for the values it computed. Adding (1)
   without (2) would have created the blocking problem the plan feared.

The exemption is narrow and stays narrow:

- **Only computed outputs.** A config limit the engineer typed (LSL/USL) is not
  something the analysis verified, so it is deliberately not in the value set.
- **Every numeric token in the fact must match**, so `7 minutes` and `7 min`
  both match a computed 7 while `9 minutes` matches nothing. A number that
  contradicts the analysis it cites is still blocked.
- **Never a date or an identifier.** An analysis computes quantities, not
  document numbers; those stay with the page ledger.
- **Not pack-gated.** A grounding gate that behaves differently per tenant is
  how invented facts reach a regulated document.
- The claim is cited to the analysis **and** to the pages its rows came from
  (taken from the worksheet column citations `load_table` wrote), so the
  derivation stays checkable end to end. The suggestion card says *Computed by
  {analysis}*.

Every existing ELR / QRA / IR grounding test passes unchanged.

### Phase 5 — report assembly

**5.1 Historic batch comparison.** `excursion-comparison.ts` flattens every
out-of-band run across every saved time series into one comparable list, oldest
first. A batch with no excursion is kept as a result rather than dropped — a
comparison that lists only failures reads as if nothing was checked.

The findings also go into the Document-chat context map, one line per saved
time series. That is what makes the table a build rather than a document walk:
comprehensive review caps at `REVIEW_INVENTORY_WALK_CAP` (48) pages against
~530, and counting excursions by eye across 15,900 readings is the exact step
that produced the wrong numbers in ERF/26/022. Every number in that line is
analysis-backed, so it survives the gate (Phase 4) and cites the analysis plus
its source pages.

**5.2 COA and calibration extraction.** Small tables, few pages — `extract_sheet`
covers them, and `load_table` now covers them better when ingest parsed them.
Not separately built; confirm on the shakedown rather than assuming.

**5.3 Figure placement.** `time_series` is a graph kind and an insertable graph
kind, so `insert_image source=analytics` copies the figure into a narrative
once the plot has been opened in Analytics (that is what captures the preview).

**5.4 Attachment list consistency.** `checkAttachmentListConsistent` on
`fir_attachments`, reading every other FIR section through `dependsOn`. It
catches the two defects the review found in ERF/26/022 — the same number used
for two documents, and a citation to an Attachment 12 that was never listed —
plus gaps in the numbering and rows with no description. An attachment listed
but never cited is `partially_met`, not a failure: enclosing one for
completeness is legitimate. A defect outranks that downgrade.

## Where this stopped (21 Sep 2026)

Working end to end on the MJ preview: eight trend prints parsed, loaded to
sheets, and RIG23001 plotted with conditional bands — **27 runs, 160
out-of-band readings, longest 22/03/2024 10:08:01→11:48:01 at 101 readings /
100 min / 844.1 high @ SP=500**, independently verified against the raw print
and matching the oracle.

All eight batches share one setpoint schedule (`0 / 250 / 500 / 600 / 800`), so
the same four bands apply to every one.

Next: plot the remaining seven, then draft. Two judgement calls are still open
and both change the report — whether a **pull-down transient** counts as an
excursion (every batch has one at every step), and whether a **single-reading
blip** does (18 of RIG23001's 27; excluding them takes the count to 9).

**Reading Langfuse settled two bugs today that the transcript could not.**
Credentials are in `.env.local`; `listRootObservations(range)` filtered to
`name === "analytics-chat"`, then `listObservationsForTrace(traceId, range)`
for `type === "TOOL"`, gives the exact tool inputs and outputs per turn. That
is how "time series plots are not supported" was traced to a hidden tool rather
than a missing feature, and how the un-banded call was caught. Note browser
timestamps are local and Langfuse is UTC — widen the window before concluding a
trace is absent.

**Still unverified.** Everything above is Analytics. Nothing has yet gone
through the Document side: the grounding gate on computed values (Phase 4), the
context-map findings line, or a DOCX export.

## Before MJ sees this

Construction is done; none of it has been through a live environment.

1. **Apply migrations `0065` and `0066`** to preview and production. A redeploy
   applies them — `vercel:build` runs `drizzle-migrate.ts` before `next build`.
   **Attachments uploaded before this shipped have no parsed tables**, and the
   Reprocess button will not fix that: `canReprocessAttachment` only accepts
   failed or incompletely-indexed attachments, not healthy ones. Re-uploading is
   the wrong fix — detection reads `document_pages.transcript`, which is already
   stored verbatim.

   **`load_table` now heals this itself.** Its listing branch calls
   `ensureDocumentTablesForReport`, which parses any run whose
   `tablesParsedAt` is null. The stamp is written even when nothing is found,
   so a document that genuinely has no table is not re-parsed on every request.
   `pnpm backfill-document-tables <reportId>` stays useful for doing a whole
   report up front (`--dry-run` shows what it would find) — but it is no longer
   a prerequisite.

   `load_table` also distinguishes *nothing parsed* from *the table store is
   unavailable*. Reporting a missing migration as "this file has no table"
   sends the model off to read hundreds of pages and blames the document for a
   deploy problem.
2. **Run `pnpm check-table-extract` against the eight trend prints.** Still the
   one test that gates everything downstream: the parser was validated on Google
   Drive's text extraction, and ingest uses unpdf. Expect ~2,142 rows, 11
   columns, `date|time|value x9` on RIG25014.
3. **Upload one print and confirm the chain end to end** — ingest parses the
   table, `load_table` lists and loads it, a time series finds the one
   excursion, and the excursion count survives into a drafted narrative.
4. **Open a DOCX export in Word.** Every layout check so far has been
   LibreOffice.
5. **Stage the prints in CI** so the oracle tests stop skipping silently.

## General vs MJ

Most of this cannot honestly be tenant-scoped — ingest, worksheet, plot kinds
and the grounding gate are platform layers.

- **MJ-specific:** 5.1, 5.2, 5.4, and the band table in 2.1.
- **General:** 1.1–1.4, 2.2, 2.3, 3.x, 4.1.
- If you want them dark elsewhere, gate the *surfacing* with pack flags
  following `statisticalAnalysisEnabled` — ship the infrastructure once.

## Gotchas

- `pnpm test -- <file>` does **not** filter; the `--` passes through and vitest
  ignores it, so the whole suite runs and times out. Use
  `pnpm vitest run <file>`.
- The husky pre-commit hook runs the full `precommit` gate. Running it manually
  first and then committing means it runs twice and can exceed a tool timeout.
  Run the gate, then `git commit --no-verify`, and say so in the message.
- `git add -A` will sweep customer documents out of `docs/sample_files/` if they
  are untracked. Two are gitignored by name; check `git status` before
  committing.
- Layout verification so far is **LibreOffice**, not Word. Open an export in
  Word before MJ does.
- The parser was validated on Google Drive's text extraction, not unpdf's. Use
  `pnpm check-table-extract` to compare, and do not assume they agree.
- **The report being reproduced has defects.** Four wrong numbers, two
  undisclosed excursions. A correct build will disagree with it — 18 readings
  where it says 16. Build so the durations come out right, not so they match the
  document.

## Test plan

Layered, anchored to the oracle above: unit (built and passing), integration
(per pending phase), and a manual end-to-end acceptance run from upload to a
Word-reviewed export. The end-to-end bar is *correctness against the review*,
not similarity to the source document.
