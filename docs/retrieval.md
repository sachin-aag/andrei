# Retrieval pipeline

Living plan for attachment search. Update this file whenever a phase lands
or a locked decision changes. Architecture that disagrees with code loses —
fix this file.

Chat stays the **control plane**. Do not replace agentic grep
(`search_documents` / outline / page read / comprehensive review) with a
standalone search product (Elasticsearch, a hosted vector DB, BM25-only).
Hybrid retrieval already runs under that control plane. Latency is mostly
tool rounds and query embeddings, not HNSW.

Caps stay as they are (250 MB/file, 500 pages/file, 1 GB/report, 50
files/report, 100k pages/month, outline/review 300 pages, search 16 hits /
80 `excludePages`, 270s chat abort). This work does not raise them.

Citations stay **filename + page**. Chunk ids change on re-ingest.

Existing **ready** attachments are not force-reprocessed. New columns apply
to new or re-ingested files; old rows fall back (empty `identifiers` →
`ILIKE` on `raw_text`; empty outline spans → live `buildOutlineFromStoredPages`).

No LLM `docKind` taxonomy in v1. Exact IDs reuse `requirementIds()` in
`src/lib/attachments/ocr-quality.ts`. Document and Analytics share
`searchReportDocuments()`. Analytics stays keyword-first at the tool layer.
Do not bump `CHAT_PROMPT_VERSION` unless prompt copy changes.

Gold labels are **filename + page**, optionally with **excerpt content**
(`mustContain`) and **cross-document negatives** (`mustNotContainAnywhere`)
— see Phase 0. Public cases live in `scripts/eval/retrieval-cases.json`
(in-repo sample PDFs). A later 1.5 GB slice uses gitignored
`scripts/eval/retrieval-cases.local.json`; `retrieval-cases.local.example.json`
is the git-tracked template for that file (real customer PDF, cannot be
committed — copy and rename once ingested locally). Do not use the chat
agent to generate labels.

Parser version is `v4` so a **reprocess** writes the new columns. Clean
ready files are left alone.

## Status

| Phase | What | Status |
| --- | --- | --- |
| 0 | Retrieval eval harness, ~20 gold cases, timings | **done** |
| 1 | Persist deterministic page metadata | **done** |
| 2 | Persist outline spans; outline reads prefer stored spans | **done** |
| 3 | Exact-identifier retrieval, page collapse, skip embed when exact fills `limit` | **done** |
| 4 | File / span routing (filename + outline identifiers before chunk search) | not started |
| 5 | Embed batching / auto retrieval mode (separate from chat `mode`) | not started |
| 6 | Reranker experiment (only after the harness shows ranking is the bottleneck) | not started |

BM25 as a third arm is deferred with the reranker. Metadata is
**filterable columns** at file / page / span grain, not more prose stuffed
into every chunk. Chunks inherit page columns via `pageId`.

## How search works today (phases 0–3)

1. Ingest writes `document_pages` (transcript + optional Gemini
   `pageContext` + retrieval columns) and `document_chunks` (vector +
   English FTS on `contextual_text`).
2. After pages exist, ingest persists `document_outline_spans` (heading
   ranges + unioned identifiers) before chunk/embed.
3. `searchReportDocuments()` classifies the query:
   - **identifier** — `requirementIds()` hit. SQL overlap on
     `document_pages.identifiers` (GIN). Empty → `ILIKE` on
     `document_chunks.raw_text` for legacy rows. Hits prepend hybrid RRF.
     If they already fill `limit`, skip `embedRetrievalQuery`.
   - **locator** — page / filename wording, no requirement id. Hybrid
     (or keyword-only) as before. Phase 4 will route files/spans first.
   - **semantic** — no extra SQL. Vector + FTS + RRF. Call counts for
     unrestricted semantic search stay at two (vector + keyword).
4. Results collapse to the best chunk per `(attachmentId, pageNumber)`
   (first wins) so grep rounds move page-to-page.
5. `@` tags still pin then backfill. They are not a hard filter.
6. `readDocumentOutline` returns stored spans when the active ingest run
   has them; otherwise it builds spans from page transcripts.

Entry points: `src/lib/attachments/retrieval.ts`,
`src/lib/attachments/page-metadata.ts`,
`src/lib/attachments/page-outline.ts`,
`src/lib/attachments/run-document-ingest.ts`. Eval:
`pnpm retrieval-eval` (default `--dry-run` validates cases;
`--report-id` runs live search).

## Phase 0 — eval harness

**Done**, extended for the excerpt-truncation regression below.
`scripts/eval/retrieval-eval.ts` + `scripts/eval/retrieval-cases.json`.
Metrics: Recall@5, Recall@10, MRR, ExcerptHit@5, NoFalsePositive@5,
embed/sql/total ms, `skippedEmbedding`. Runs write JSON under
`scripts/eval/retrieval-runs/` (gitignored).

Public gold is grounded in:

- `docs/sample_files/appendix-b-790-00134r-revu.pdf` — 62-page scan, no
  text layer past page 1 (verified with `unpdf`), no human transcription;
  tests treat **SW-LWB-4 on page 31** but do not assert `mustContain` —
  the exact OCR wording is unverified and must not be guessed.
- `docs/sample_files/SOP-DP-QA-010-R04 SOP.pdf` — pages from
  `docs/sop-010-r04-transcription.md`. That doc's *literal quoted* form
  names / column labels / questions back `mustContain` on several cases;
  its *paraphrased* summaries (TOC flow, numeric RPN tables with
  dash-glyph-sensitive ranges, the A02 decision-tree diagram) do not — see
  each case's `notes` for why.
- `docs/sample_files/DEV-QC-25-010 Copy (1).pdf` — filename locators
  only (almost no native text; do not invent page numbers).

Schema for a case:

```jsonc
{
  "id": "...",
  "query": "...",
  "kind": "identifier" | "locator" | "semantic",
  "gold": [
    { "filename": "...", "page": 1, "mustContain": ["..."] } // mustContain optional
  ],
  "mustNotContainAnywhere": ["..."], // optional; gold may be [] only when this is set
  "notes": "..."
}
```

Vitest validates the JSON (`scripts/eval/retrieval-cases.test.ts`).

### Known gap this schema now catches: excerpt truncation

Recall@k asks "did we find the right page?" It does not ask "did the model
see the part of the page that answers the question?" Both production and
this branch returned page 121 of a real Convergent DV attachment for
"logic analyzer" / "Saleae" / `"logic analyzer"` (Recall@5 = 1.0 across
multiple Langfuse traces) while every returned excerpt was the chunk-0
UUT/header boilerplate — Table 3's Logic Analyzer row never appeared in
any snippet the model saw. The model correctly reported "not found" from
what it was shown; a screenshot (bypassing chunk search entirely) answered
it instantly. Investigated 2026-09-04; see `mech-logic-analyzer` in
`scripts/eval/retrieval-cases.local.example.json` for the full trace
citations.

Two new gold-hit-level / case-level fields close this blind spot:

- **`mustContain`** (per gold hit) — substrings the *excerpt text* must
  contain, not just the filename+page. `excerptHitAtK` scores this; it is
  `null` (not 0) for hits that don't declare it, so unverifiable scanned
  pages don't drag the aggregate down. A case can score Recall@5 = 1.0 and
  ExcerptHit@5 = 0 simultaneously — that combination *is* the bug.
- **`mustNotContainAnywhere`** (per case) — terms that must not appear in
  *any* returned excerpt in the top-k window. For queries whose correct
  answer is "not found" (e.g. `SW-LWB-4` against a report that doesn't
  have it — see `mech-sw-lwb-4-cross-document-negative`), a hallucinated
  match on the wrong document is worse than a correct negative.
  `noFalsePositiveAtK` scores this; also `null` when unset. `gold` may be
  `[]` only when this field is set and non-empty.

Only add `mustContain` / `mustNotContainAnywhere` from a *verified* source:
a `read_document_page` tool output (verbatim, not LLM-summarized), a
`document-review-extract` finding cross-confirmed across more than one
batch call, a human transcription doc, or a literal PDF text layer read
with `unpdf`. Do not paraphrase a summary into a `mustContain` string and
call it verified — that turns the metric into testing your own guess.

### Local corpus example (real customer PDF, cannot be committed)

`scripts/eval/retrieval-cases.local.example.json` is git-tracked and
inert by default — the harness only loads `retrieval-cases.local.json`
(gitignored), so the example does nothing until a contributor copies it.
It mines six real cases against a 273-page Convergent Solea Model 3
Design Verification attachment (`Mechanical Test Report Attachments
only.pdf`) from production Langfuse traces: the Logic Analyzer excerpt
bug, its "not on the executed-equipment-log pages" companion, the
SW-LWB-4 cross-document negative, a UUT table that spans three pages, a
deviation form buried among near-identical templates, and a cover/purpose
page. Every gold value cites the Langfuse trace it came from.

To use it: ingest that attachment into a local dev report under the same
filename, `cp scripts/eval/retrieval-cases.local.example.json
scripts/eval/retrieval-cases.local.json`, then
`pnpm retrieval-eval -- --report-id <id>`. `retrieval-cases.local.example.test.ts`
keeps the template itself honest against schema changes even without that
PDF present (dry-run parse only — it does not hit the DB).

## Phase 1 — page metadata

**Done.** `document_pages` columns (nullable visual flags mean
*not classified*, not “no table”):

| Column | Meaning |
| --- | --- |
| `outline_title` | Deterministic heading from the transcript (or null) |
| `identifiers` | `text[]` from `requirementIds()`, cap 40, GIN |
| `has_table` | `true` / `false` only when Gemini insight/vision ran; else `null` |
| `has_figure` | same |

15-page OCR waves, text-layer-only batches, OCR-without-insight, and gap
pages leave visual flags null. Insight/vision empty `tables[]` /
`figures[]` store `false`. Extract still folds table/figure *notes* into
`visual_interpretation` for the model; the columns are for filters.

`PARSER_VERSION` is `v4`. Extract prompt version is unchanged.

## Phase 2 — outline spans

**Done.** Table `document_outline_spans`: one row per heading range on an
ingest run (`ordinal` unique per run). Identifiers are the union of page
ids in `[page_start, page_end]`. `readDocumentOutline` prefers stored
spans and falls back to `buildOutlineFromStoredPages` when the run has
none (legacy ready files).

## Phase 3 — exact-id retrieval

**Done.** Hybrid default still used by Document chat (no new tool `mode`).
Identifier queries run exact-first. Page collapse is on for every mode.
Keyword-only Analytics grep still skips embeddings; an identifier query
that already fills `limit` skips embeddings in hybrid too.

## Phase 4 — file / span routing (not started)

Before chunk search, restrict to attachments / outline spans whose
filename, `document_summary`, or span `identifiers` match a locator or
id. Keep pin + backfill. Do not hard-filter `@` tags.

## Phase 5 — embed batching / auto mode (not started)

Batch query embeddings when `search_documents` sends `queries[]`. A
server-side auto path is not a new chat tool enum — Document chat should
keep defaulting to hybrid-with-ids. Only add a mode if a benchmark needs
an ablation.

## Phase 6 — reranker (not started)

Run only if Recall@10 is high and Recall@5 / MRR are weak on the harness.
Do not add a cross-encoder “because RAG blogs say so.”

## Locked non-goals

- Raising upload / page / report caps.
- Cross-report search.
- Force-reindex of ready attachments.
- LLM document-type labels.
- Replacing FTS with BM25 or moving vectors off Postgres.
- Prompt bump for server-side exact-id (no copy change).
