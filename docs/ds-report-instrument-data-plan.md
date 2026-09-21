# Investigation Report DS — instrument data, analysis, and figures

Living plan. Update it whenever a phase lands or a locked decision changes.
Architecture that disagrees with code loses — fix this file.

Status: **Phase 1.1 and 2.1/2.2 landed** (`e87246e5` on `feat/IR_DS`).
Everything else is specified but not built.

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

Also: RIG25014 has **exactly one** out-of-band run in its whole cycle;
C072630015/16/17 have **none** at the 800 µbar setpoint.

Conditional bands, from the recipe: `800 → 650–950`, `600 → 480–720`,
`500 → 380–620`, `250 → 200–600`. All eight prints share one recipe, so the
mapping is constant across them.

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

## Pending

### Phase 1.2 — structured storage

`document_tables` (attachment, page span, column schema) and
`document_table_rows` (typed cells, ordinal, source page). Migration follows the
convention in `src/db/migrations/` — see `0065` for the enum-value pattern.

Wire `detectTables` into `runDocumentIngest`, gated on `textLayer.usable`.
Scanned tables keep falling through to the vision path.

### Phase 1.3 — `load_table`

Analytics chat tool: load a parsed table straight into a worksheet sheet. No
LLM, no page cap, exact values, page citations preserved on the column spec the
way `write_column` already does. Bump `ANALYTICS_CHAT_PROMPT_VERSION`.

`WorksheetColumn.values` is `string[]`, so a timestamp column needs no schema
change.

### Phase 1.4 — ingest at volume

613 pages for one investigation. The page budget (100,000/month) is not the
concern; wall-clock time is. Consider skipping chunk+embed for pages that parse
cleanly as tables — nothing will ever retrieve them by similarity.

### Phase 2.3 — excursions as a saved analysis

A Results row like any other plot, so it is versioned, re-runnable and citable,
going stale via `sourceHash` when analysed rows change. Without this the
analysis is a one-off and the report is not reproducible.

### Phase 3 — `time_series` analysis kind

All six existing `AnalysisKind`s require a **numeric** X, so no current plot can
take a timestamp. Add a new kind rather than stretching `xy_scatter`: axis
handling, default mark and spec rendering all differ.

- Parse the timestamp column to epoch for scaling; keep the original string for
  tick labels (the source stacks time over date).
- Step interpolation by default — this is sampled data, not a continuous signal.
- Band shading from the conditional spec.
- Register in `WORKSHEET_PLOT_CATALOG` so Plot and Analyze-data cannot drift.
- *Export with Excel charts* must produce a native chart. Decide downsampling
  for a 15,000-point series deliberately.
- The source figure's `00:13:39 / −192.1` cursor readout is the excursion
  duration and depth — render it from the detected run rather than asking anyone
  to place cursors.

### Phase 4 — computed facts must survive grounding

**The highest-risk item here. Do not rush it.**

`groundDraftText` validates hard facts against the citation ledger's served page
quotes, and MJ runs `unsupportedFactPolicy: "block"`. `192.40 µbar` survives
because it is printed on a page. *"8 consecutive one-minute readings"* and
*"7 minutes elapsed"* appear nowhere — they are derived, so they are blocked and
the draft silently loses them.

The precedent is already set, in `agent-generated-charts-plan.md`:

> a chart is a faithful rendering of numbers that exist on a cited page, not an
> invention — but only if the rendering stays *derivable*

The same argument applies to scalars. A value computed by a saved analysis over
cited rows is derivable in exactly that sense. So this is not "weaken the gate",
it is "apply the charts precedent to numbers".

Required behaviour:

- A value backed by a saved analysis is written, cited to the analysis **and**
  its source pages.
- An unbacked number is still blocked.
- A number contradicting the analysis it cites is still blocked.
- Existing ELR / QRA / IR grounding tests unchanged. Widening the gate for one
  document type must not widen it for all.
- **Do not pack-gate this.** A grounding gate that behaves differently per
  tenant is how invented facts reach a regulated document.

### Phase 5 — report assembly (MJ)

- **Historic batch comparison.** The source's 10-column table is one row per
  detected run across every attached trend. Once 2.2 runs per batch this is a
  table build, not a document walk — which is the only way it fits, since
  inventory review caps at `REVIEW_INVENTORY_WALK_CAP` (48) against ~530 pages.
- **COA and calibration extraction.** Small tables, few pages; existing
  `extract_sheet` should cover it. Confirm rather than assume.
- **Figure placement.** `insert_image` with `source=analytics` already works.
- **Attachment list consistency.** The review found Attachment 2 used for two
  documents and references to a non-existent Attachment 12. The structured
  attachment table makes a deterministic check possible.

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
- **The report being reproduced has defects.** Four wrong numbers, two
  undisclosed excursions. A correct build will disagree with it — 18 readings
  where it says 16. Build so the durations come out right, not so they match the
  document.

## Test plan

Layered, anchored to the oracle above: unit (built and passing), integration
(per pending phase), and a manual end-to-end acceptance run from upload to a
Word-reviewed export. The end-to-end bar is *correctness against the review*,
not similarity to the source document.
