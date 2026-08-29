# Agent-Generated Charts — Implementation Plan

Status: **not started**. Written 2026-08-25 for execution after
`cursor/agent-insert-image-7c1f` merges to `main`.

## What this is

A chat tool that reads numeric measurements out of an ingested attachment and
renders them as a scatter plot with acceptance limits, proposed to the engineer
as a reviewable image suggestion.

Worked example (Convergent mechanical DV, `825-00101`): requirement
`M3-SYS-FN-037`, tip detachment torque, 30 measurements against limits of 1 and
6 ozf-in.

## Why this needs a plan rather than just a tool

**This is the first time the system generates pixels.** Today every image in a
report was produced by a human — uploaded in the editor, attached in chat, or
imported from a DOCX. `insert_image` (on `cursor/agent-insert-image-7c1f`) can
only *relocate* an existing image; its description says verbatim:

> Do not generate new pixels.

and `draft_field` rejects markdown image syntax via `markdownHasImage()` so the
model cannot smuggle one in. That invariant is deliberate, and this feature
breaks it.

The break is justified — a chart is a faithful rendering of numbers that exist
on a cited page, not an invention — but only if the rendering stays *derivable*.
So the governing rule of this whole plan:

> **Every plotted point must trace back to a literal value on a cited page, and
> the chart must carry the data it was drawn from.**

That is what `chartSpec` (§4) is for. A PNG on its own is unreviewable; a PNG
plus the series that produced it is auditable and re-renderable. Do not drop
`chartSpec` to save bytes.

## Ground rules

1. **Explicit request only.** The agent never offers, suggests, or volunteers a
   chart. It plots when the engineer asks for a chart/plot/graph in words.
2. **No pack gating.** Nothing here is Convergent-specific. `insert_image` has
   no customer checks and neither does this. It ships to demo, MJ and
   Convergent, and to investigation reports as well as DV.
3. **The model picks labels and layout, never data.** Every numeric value comes
   from the validated extraction step. There is no tool parameter through which
   a model can type a data point.
4. **Proposal, never a direct write.** Reuses the existing accept/reject
   suggestion path, so even a spurious call cannot land content.
5. **Not in plan mode.** Plan mode is read-only; do not add the tool to the
   allowlist in `chat/route.ts`.

## Prerequisites

- [ ] `cursor/agent-insert-image-7c1f` merged to `main`
- [ ] `main` merged into `feat/mechanical`

Expect conflicts in `src/lib/ai/chat/tools.ts` and
`src/lib/ai/chat/system-prompt.ts` — both branches edit them substantially.
Conflicts should be mechanical (different regions), but resolve them before
starting Phase 1, and run `pnpm precommit` on the merge result *before* writing
any new code so you know a later failure is yours.

---

## Phase 1 — Chart spec and renderer

Pure functions, no chat, no DB, no retrieval. Fully testable in isolation.
**Do this phase first and completely** — it is the piece with no dependencies
on the merge.

### 1.1 `src/lib/charts/chart-spec.ts`

```ts
export type ChartPoint = {
  /** X position. Assigned by layout, not by the model. */
  x: number;
  y: number;
  /** Legend group, e.g. a handpiece serial. null = single ungrouped series. */
  series: string | null;
  /** Source label for the tooltip/audit, e.g. "P33-0924-10012 Tip 3". */
  label: string;
};

export type ChartLimits = {
  lower: number | null;
  upper: number | null;
};

export type ChartSpec = {
  version: 1;
  kind: "scatter";
  title: string;
  xLabel: string;
  yLabel: string;
  /** Unit of measure, e.g. "ozf-in". Rendered into yLabel by the builder. */
  uom: string;
  limits: ChartLimits;
  points: ChartPoint[];
  layout: ChartLayout;
  /** Provenance. Empty only for explicitly-mocked specs (see §1.4). */
  citations: ChartCitation[];
};

export type ChartCitation = {
  attachmentId: string;
  page: number;
};

export type ChartLayout = {
  /** "combined" = one chart. "per-series" = one chart per series group. */
  mode: "combined" | "per-series";
  /** "unit" = colour + legend by series. "none" = one colour, no legend. */
  seriesBy: "unit" | "none";
  /** "sequential" = x is 1..N across all points, "replicate" = x is the
   *  within-series index, series overlaid. */
  xAxis: "sequential" | "replicate";
  /** null = auto from data and limits with padding. */
  yRange: { min: number; max: number } | null;
};

export const DEFAULT_CHART_LAYOUT: ChartLayout = {
  mode: "combined",
  seriesBy: "unit",
  xAxis: "sequential",
  yRange: null,
};
```

**The default layout is a decision, not a placeholder.** One chart per
acceptance criterion, all points pooled, series distinguished by colour and
legend. Rationale: `825-00104 Rev B` Table 1 says the sample size *"can be
attained using multiple different handpieces and tips. Replicates allowed."*
The handpieces are not test conditions — they are how you reach n≥29. Three
separate charts would imply three independent results and invite a
per-handpiece pass/fail the protocol never defines. Pooling also draws each
limit line exactly once, which is what the criterion actually is.

Also implement:

```ts
/** Assign x positions per layout.xAxis and sort deterministically. */
export function layoutPoints(spec: ChartSpec): ChartPoint[];

/** Auto y-range: covers data and both limits, padded, snapped to a nice step. */
export function resolveYRange(spec: ChartSpec): { min: number; max: number };

/** Split into one spec per series when layout.mode === "per-series". */
export function splitSpec(spec: ChartSpec): ChartSpec[];
```

`layoutPoints` must be a pure function of the spec — same spec in, identical
positions out. No `Date.now()`, no `Math.random()`, no iteration over object
key order.

### 1.2 `src/lib/charts/render-chart.ts`

```ts
export type RenderedChart = {
  /** PNG data URL, ready for SuggestionImageInsert.src */
  dataUrl: string;
  widthPx: number;
  heightPx: number;
};

export async function renderChartPng(
  spec: ChartSpec
): Promise<RenderedChart | { error: "canvas_unavailable" }>;
```

Use `@napi-rs/canvas` — **already a dependency**, do not add a charting
library. Copy the lazy-require pattern from
`src/lib/export/docx-google-docs-images.ts:16-24`:

```ts
function loadCanvasModule(): CanvasModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as CanvasModule;
  } catch {
    return null;
  }
}
```

That file treats the native binding as **optional** and degrades silently.
Charts cannot degrade silently — a missing binding must surface as
`canvas_unavailable`, which the tool turns into an explicit message. Never
return a blank or partial image.

Visual target is the reference screenshot: white plot area, light grey
gridlines, dark-teal filled circular markers, red dashed horizontal limit
lines, centred title, axis labels on both axes, axes starting at 0 with one
unit of headroom past the data/limits.

Render at 960×720 logical, **2× device scale** (1920×1440 backing store) so the
DOCX export is not blurry, then emit PNG. Check the resulting base64 length
against `CHAT_SECTION_IMAGE_MAX_DATA_URL_CHARS`
(`src/lib/ai/chat/section-images.ts`, ~1.47M chars). A flat-colour chart PNG at
this size lands well under it; if a spec somehow exceeds it, drop to 1× rather
than failing.

Colours: use the `--brand-*` ramp values, not hardcoded hexes copied from the
screenshot. Charts render server-side so CSS variables are unavailable —
resolve the pack's ramp in code, and note that the ramp differs per pack (demo
navy `#001838`, MJ navy `#133782`, Convergent blue `#0079c1`). Limit lines stay
red in every pack; red means out-of-spec here, it is not a brand colour.

### 1.3 Tests — `src/lib/charts/*.test.ts`

- `layoutPoints` is deterministic: same spec twice → identical output
- `xAxis: "sequential"` numbers 1..N across all series in stable order
- `xAxis: "replicate"` restarts numbering per series
- `resolveYRange` includes both limits even when data is far inside them
- `splitSpec` on `per-series` yields one spec per group, each keeping the full
  limits and title suffixed with the series name
- `renderChartPng` returns a `data:image/png;base64,` URL that satisfies
  `isValidSuggestionImageSrc` (`src/lib/suggestions/image-insert.ts`)
- Rendered PNG dimensions parse correctly via `readRasterDimensions`
  (`src/lib/export/raster-dimensions.ts`)
- `canvas_unavailable` path returns the error object, not a throw

Do not snapshot PNG bytes — native canvas output varies across platforms and
versions, and the test will rot. Assert structure, dimensions, and validity.

### 1.4 Mock fixture

`src/lib/charts/__fixtures__/torque-mock.ts` exporting the 10 points from the
reference screenshot:

```
3.1, 4.1, 3.3, 4.1, 4.6, 2.3, 3.6, 3.4, 4.1, 3.9   (ozf-in, limits 1 and 6)
```

These are **mock values chosen for visual review**, not the report's data. The
real appendix values are 30 points on quarter/half increments spanning 2.5–5.5
(see §2.2). Mark the fixture clearly so nobody wires it into a real report.
`citations: []` is permitted only here.

Add a scratch script that writes the fixture render to a PNG on disk so a human
can eyeball it before Phase 2 exists.

**Phase 1 exit criteria:** a human has looked at the rendered mock PNG and
agreed it matches the reference. Do not start Phase 2 before that.

---

## Phase 2 — Measurement extraction

### 2.1 `src/lib/charts/extract-measurements.ts`

```ts
export type ExtractedMeasurement = {
  seriesLabel: string | null;   // "P33-0924-10012"
  replicateLabel: string;       // "Tip 3"
  value: number;
  uom: string;
  attachmentId: string;
  page: number;
};

export type MeasurementExtraction =
  | { status: "ok"; measurements: ExtractedMeasurement[]; limits: ChartLimits;
      uom: string; citations: ChartCitation[] }
  | { status: "not_found"; message: string }
  | { status: "unverified"; message: string; rejected: string[] };
```

Flow: hybrid retrieval via `searchReportDocuments`
(`src/lib/attachments/retrieval.ts`) for the requirement ID → LLM reads the
page transcripts and emits structured rows → **deterministic validation gate**.

### 2.2 The validation gate — the load-bearing part

The model reads the page; code decides what survives. Reject any row where:

- `value` does not appear as a literal substring on the cited page. Normalise
  whitespace only; do not normalise number format. If the page says `4.25`, a
  model answer of `4.3` is rejected, not rounded.
- `uom` is inconsistent across rows
- `page` is not a page that retrieval actually returned
- `value` is not finite

If any row is rejected, return `unverified` listing the rejected values — do
**not** silently drop rows and plot the rest. A chart with quietly missing
points is worse than no chart.

Then report the surviving count against the test plan minimum when one is
known, as an advisory field, not a hard failure.

This mirrors the existing posture in `results-inventory.ts`, where
`isRequirementRowId` filters model output before it is allowed to become
report content.

**Verified source data** (`Mechanical Test Report Attachments only.pdf`, pages
13–14 of the split, `M3-SYS-FN-037` data collection form). These pages are
embedded text, not scans — `pdftotext` extracts all 30 values cleanly, so
Vertex extract will have them verbatim in the page transcript. The rows read:

```
Handpiece S/N P33-0924-10012  Tip 1: 3 ozf-in
Handpiece S/N P33-0924-10012  Tip 2: 2.5 ozf-in
...
```

30 values across three handpieces (`P33-0924-10012`, `-10017`, `-10018`),
range 2.5–5.5, all inside 1–6. The same table also carries the acceptance text
(*"greater than or equal to 1 ozf-in and less than or equal to 6 ozf-in"*), so
limits and UoM come from the same page as the values — **no cross-document join
is needed**, and the citation stays a single page.

Capture these 30 rows as a test fixture from the real transcript.

### 2.3 Tests

- Happy path: fixture transcript → 30 measurements, limits `{1, 6}`, uom
  `ozf-in`, series grouped by handpiece
- A model row whose value is absent from the page → `unverified`, that value
  named in `rejected`
- Mixed UoM across rows → `unverified`
- A cited page retrieval never returned → `unverified`
- No matching page → `not_found`

---

## Phase 3 — The chat tool

### 3.1 `plot_measurements` in `src/lib/ai/chat/tools.ts`

Model the implementation directly on `insert_image` (same file). Reuse, do not
reimplement:

| Concern | Reuse |
|---|---|
| Editability | `canEdit` guard, `not_editable` status |
| Document-review gate | `shouldGateDraftOnDocumentReview` |
| Section/field resolution | `isChatEditableSection`, `resolveTargetField`, `isRichTargetField` |
| Image cap | `countImagesInDoc` vs `MAX_IMAGES_PER_SECTION` (10) |
| Positioning | `checkProposedEdit(fieldText, { anchorText, deleteText: "", insertText: "", insertImage }, fieldDoc)` |
| Persistence | `db.insert(comments)` with `kind: "ai_fix"`, `serializeAiFixCommentContent({ ..., insertImage, reasoning, contentHashAtSuggestion })` |
| Accept/reject | `pendingImageInlineNode`, `acceptPendingImageSuggestions` — already wired to the suggestion card and margin gutter |

Input schema — note there is **no way to pass a data point**:

```ts
z.object({
  section: z.enum(sectionEnum),
  targetField: z.string(),
  requirementId: z.string(),          // drives extraction
  title: z.string().max(120).optional(),
  xLabel: z.string().max(60).optional(),
  yLabel: z.string().max(60).optional(),
  layout: z.object({
    mode: z.enum(["combined", "per-series"]).optional(),
    seriesBy: z.enum(["unit", "none"]).optional(),
    xAxis: z.enum(["sequential", "replicate"]).optional(),
    yMax: z.number().optional(),
  }).optional(),
  anchorText: z.string().default(""),
  reasoning: z.string().max(300),
})
```

Layout is a closed enum set so a restyle request maps to a parameter, never to
free-form drawing instructions. Natural-language mapping:

| Engineer says | Parameter |
|---|---|
| *"split it into three charts"* | `mode: "per-series"` |
| *"drop the legend"* | `seriesBy: "none"` |
| *"put tip number on the x axis"* | `xAxis: "replicate"` |
| *"cap the y axis at 7"* | `yMax: 7` |

Execute order: guards → extract → build spec → render → validate src →
`checkProposedEdit` → persist. Return statuses covering `proposed`,
`not_editable`, `review_incomplete`, `invalid_section`, `invalid_field`,
`plain_field`, `too_many_images`, `measurements_not_found`,
`measurements_unverified`, `render_unavailable`.

For `mode: "per-series"`, `splitSpec` yields N specs — persist N suggestions in
one transaction and return all their ids, so accepting is still per-chart.

### 3.2 Re-prompting edits the spec, not the data

When the engineer asks for a restyle of a chart they can already see, the tool
**must not re-run extraction**. Read `chartSpec` off the existing
`imageInline` node, apply the layout change, re-render, propose a replacement.

This is the property that makes the whole feature safe: two versions of a chart
can never disagree about what was measured, because only one extraction ever
happened. Implement it in Phase 3, not as a later optimisation — retrieval is
non-deterministic and a second extraction can legitimately return a different
set.

### 3.3 Provenance on the node

Extend `ImageInlineAttrs` (`src/lib/tiptap/image-inline.ts`) with:

```ts
chartSpec?: ChartSpec | null;   // present ⟺ agent-rendered chart
```

Three image origins will now exist in a report — human upload, relocated chat
photo, agent-rendered chart — and only the third is synthesized. `chartSpec`
is what distinguishes them. Once both are a bare `imageInline` with a data URL,
the distinction is unrecoverable after the fact.

Confirm it survives: TipTap attr round-trip, `sendBeacon` autosave, the
`sectionContentVersions` snapshot, and DOCX export (export ignores it; it must
not crash on an unknown attr).

### 3.4 System prompt

In `src/lib/ai/chat/system-prompt.ts`, amend the no-new-pixels rule to name its
one exception, and add the explicit-request rule. Both must be assertions in
`system-prompt.test.ts`:

- charts are the only permitted generated image, and only from cited data
- never offer or volunteer a chart; plot only when asked in words
- restyling an existing chart re-uses its `chartSpec`

Also update `insert_image`'s description so *"Do not generate new pixels"*
points at `plot_measurements` instead of being flatly contradicted by it.

### 3.5 Do NOT add to the plan-mode allowlist

`chat/route.ts` allowlists plan-mode tools explicitly and anything unlisted is
silently unavailable. Leave `plot_measurements` out. Add a test asserting it is
absent from the plan tool set — this is a guard that will otherwise be
undone by a future well-meaning edit.

---

## Phase 4 — Export verification

Largely free, but must be proven rather than assumed.

`applyInlineMediaToDocxZip` already runs on both export branches —
investigation (`generate-docx.ts:500`) and design-verification (`:566`) — and
`narrative-to-docx-xml.ts:354` handles `imageInline` via `registerInlineImage`.
So a chart in a narrative field should export with no template change.

- [ ] E2E-ish test: mechanical DV report with a chart in `observations` →
      export → PNG present in `word/media/`, relationship + content-type
      entries correct
- [ ] Same for an investigation report (proves the not-pack-gated claim)
- [ ] Chart renders at a sane size in Word — `registerInlineImage` caps at
      `MAX_INLINE_EXPORT_WIDTH_PX`; check a 1920px-wide chart is not squashed
- [ ] `applyGoogleDocsImageCompat` does not mangle it

---

## Verification checklist

- [ ] `pnpm precommit` (lint + typecheck + vitest)
- [ ] Rendered mock chart visually matches the reference screenshot
- [ ] Round trip: propose → accept → autosave → reload → export, chart intact
- [ ] Reject path: propose → dismiss → no image left in the section
- [ ] `chartSpec` present on accepted node, absent on human-uploaded images
- [ ] Restyle re-uses `chartSpec` — confirmed by asserting extraction is not
      called a second time
- [ ] Tool unavailable in plan mode
- [ ] Works with `ANDREI_CUSTOMER` set to each of demo, mj, convergent

## Known gotchas

- **`@napi-rs/canvas` is optional in the existing loader.** It is required
  here. Fail loudly with `render_unavailable`; never emit a partial image.
  Check the Vercel build includes the native binding for the deployed
  architecture before shipping — `@napi-rs/canvas-linux-x64-gnu` is pinned in
  `package.json`, but confirm it resolves at runtime, not just at build.
- **Data URLs inflate JSONB.** A chart is roughly 40–80 KB of base64 in
  `report_sections.content`, duplicated into every `sectionContentVersions`
  snapshot. Fine for a handful; revisit if someone plots a dozen requirements
  in one report.
- **Turbopack route registration.** A newly added route can 404 on first
  compile in `pnpm dev`; restart the dev server. Not a code bug.
- **The screenshot is not the report's data.** 10 points at tenths vs 30 points
  on quarter/half increments. Mock is for visual review only.
