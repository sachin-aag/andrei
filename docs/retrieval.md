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

Gold labels are **filename + page** plus a required **`passCriteria`**
string for the LLM judge. Optional **excerpt content** (`mustContain`) and
**cross-document negatives** (`mustNotContainAnywhere`) still exist as
deterministic metrics. Public cases live in
`scripts/eval/retrieval-cases.json` and target a synthetic born-digital
corpus (not a customer PDF). CI downloads that corpus from a test GCS
bucket, ingests it, searches, and judges. Do not use the chat agent to
generate labels.

Parser version is `v4` so a **reprocess** writes the new columns. Clean
ready files are left alone.

## Status

| Phase | What | Status |
| --- | --- | --- |
| 0 | Retrieval eval harness | **partial** — CI gates the synthetic nine; overlay is a laptop `--report-id` path. That is not proof the 273-page Convergent file is fixed (see [Harness status](#harness-status-phase-0)) |
| 1 | Persist deterministic page metadata | **done** |
| 2 | Persist outline spans; outline reads prefer stored spans | **done** |
| 3 | Exact-identifier retrieval, page collapse, skip embed when exact fills `limit` | **done** |
| 3.5 | Match-centered excerpts, best chunk per page, lexical fast path, quote-over-visual, locator ranking | **done** |
| 4 | File / span routing (filename + outline identifiers before chunk search) | **done** |
| 5 | Embed batching / auto retrieval mode (separate from chat `mode`) | **done** |
| 6 | Deterministic rerank (no cross-encoder) | **done** |

BM25 as a third arm is deferred with the reranker. Metadata is
**filterable columns** at file / page / span grain, not more prose stuffed
into every chunk. Chunks inherit page columns via `pageId`.

### What landed vs the original harness plan

Phase 0 started as dry-run JSON + Recall@k / MRR against in-repo sample
PDFs (Appendix B, SOP-010) and a gitignored local overlay. The follow-up
was to make the harness catch **right page, wrong excerpt** and
**cross-document false positives**, then grade real Langfuse failures.

What actually shipped is a smaller public set plus a lot of adjacent
plumbing:

| Item | Status |
| --- | --- |
| `mustContain` / `excerptHitAtK` (excerpt, not just filename+page) | **done** — every public gold hit with a unique answering substring sets `mustContain` |
| `mustNotContainAnywhere` / `noFalsePositiveAtK` | **done** |
| LLM judge + required `passCriteria` | **done** (added after the metric work) |
| Path-gated Vitest + live `pnpm retrieval-eval -- --from-gcs` in CI | **done** |
| Synthetic GCS corpus (two born-digital PDFs, nine cases) | **done** — replaced the sample-PDF gold |
| GitHub OIDC WIF (no JSON SA key); CI download-only (no seed/upload) | **done** |
| Phase 3.5 product fix (match-centered snippet, best chunk per page, lexical fast path, quote over `visual_interpretation`, locator ranking) | **done** — this was the product tangent that the harness was meant to gate |
| Six Langfuse-mined cases (`retrieval-cases.local.example.json`) | **done as a template** — copy to gitignored `retrieval-cases.local.json` for a laptop `--report-id` run. Not CI |
| `retrieval-cases.local.json` overlay loaded by the runner | **done** — laptop `--dry-run` / `--report-id` only; CI `--from-gcs` / `--live` never merge it |
| Public gold on `docs/sample_files/` (Appendix B `SW-LWB-4`, SOP-010 FMEA pages) | **dropped** — the synthetic corpus is the public gold |
| CI `--report-id` against a production-shaped report | **dropped** — `--report-id` stays a laptop path |
| CI run-artifact / Recall@5 trend across PRs | **dropped** — CI already uploads `retrieval-runs/` JSON; a trend series is not leftover for this architecture |

Phase 0 stays **partial** because the synthetic nine is not the 273-page
Convergent file. Run that file with the overlay + `--report-id` on a
laptop. Do not treat a green CI job as proof that production excerpt
truncation is gone.

### Harness status (phase 0)

The loader and public `mustContain` gold are in. Remaining work is
operational, not a new retrieval design:

1. **Private overlay file.** Copy
   `scripts/eval/retrieval-cases.local.example.json` to gitignored
   `retrieval-cases.local.json` on a machine that already ingested the
   273-page Convergent attachment, then `pnpm retrieval-eval -- --report-id <id>`.
   CI must not do this.
2. **Ship with current `main`.** This branch’s retrieval SQL is
   `0058_document_page_retrieval_metadata` so it does not collide with
   `0056_attachment_library` / `0057_attachment_storage_budget`.

### Not a leftover for this architecture

Do not restore Appendix B / SOP-010 as public gold. Do not add a
cross-encoder. Do not add Recall@5 trend comparison as a merge
requirement. The deterministic rerank in phase 6 does not need that
signal.

## How search works today (phases 0–6)

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
     (or keyword-only) as before. File/span routing runs first (phase 4).
   - **semantic** — no extra SQL. Vector + FTS + RRF. Call counts for
     unrestricted semantic search stay at two (vector + keyword).
4. Results collapse to the best chunk per `(attachmentId, pageNumber)`
   (highest lexical overlap with the query, not chunk ordinal 0). Search
   excerpts are centered on the query match instead of always taking the
   first 900 characters of the winning chunk.
5. Semantic/locator queries also run a lexical `ILIKE` pass (phrase + token
   AND) before hybrid search. When those hits alone fill `limit` with
   positive lexical scores, skip `embedRetrievalQuery` (same fast-path shape
   as identifier queries).
6. Identifier and locator queries load ready files + stored outline spans
   and **route** to matching attachments (filename / `document_summary`) or
   heading spans (`identifiers`) before chunk search. If that pass is under
   `limit`, the rest of the report is backfilled. `@` tags still pin then
   backfill and are not a hard filter. Semantic queries do not restrict.
7. `search_documents` `queries[]` embeds unique **semantic** strings with one
   `embedMany` (`searchReportDocumentsMany`). Identifier / locator queries
   keep the skip-embed path. There is no new chat `mode` enum.
8. Candidates are **reranked** with a deterministic score (locator file/page
   boost, then identifier-in-excerpt, then `lexicalMatchScore`) before
   slicing to `limit`. Ties keep original order. Not a cross-encoder.
9. `readDocumentOutline` returns stored spans when the active ingest run
   has them; otherwise it builds spans from page transcripts.

Entry points: `src/lib/attachments/retrieval.ts`,
`src/lib/attachments/page-metadata.ts`,
`src/lib/attachments/page-outline.ts`,
`src/lib/attachments/run-document-ingest.ts`. Eval:
`pnpm retrieval-eval` (default `--dry-run` validates cases and merges a
local overlay when present; `--from-gcs` is the CI path (download only;
never upload; never overlay); `--live` generates the same PDFs without
GCS and never overlays; `--report-id` searches an already-ingested
report and merges the overlay).

## Phase 0 — eval harness

**Partial.** `scripts/eval/retrieval-eval.ts` + `scripts/eval/retrieval-cases.json`
+ a synthetic corpus (`scripts/eval/retrieval-corpus.ts`). See
[Harness status](#harness-status-phase-0).

The public cases are small on purpose: two born-digital PDFs that reproduce
the failure modes that matter (right page / wrong 900-character slice,
required-vs-executed tables, identifier lookup, cross-file leak, true
negative). They are **not** a customer attachment and are **not** the
in-repo SOP / Appendix B scans. Those golds stay dropped. Private
production cases live in the optional overlay, not in CI.

**Pass/fail** is an LLM judge (`scripts/eval/retrieval-judge.ts`,
`RETRIEVAL_JUDGE_PROMPT_VERSION`). Recall@5 is informational. A
`mustNotContainAnywhere` leak fails the case before the judge runs.

```bash
pnpm retrieval-eval -- --dry-run          # parse + print cases (merges overlay if present)
pnpm retrieval-eval:upload                # laptop only: write PDFs to the test bucket
pnpm retrieval-eval -- --from-gcs         # CI path: download, ingest, search, judge (no overlay)
pnpm retrieval-eval -- --live             # same PDFs, skip GCS (laptop + Vertex; no overlay)
cp scripts/eval/retrieval-cases.local.example.json scripts/eval/retrieval-cases.local.json
pnpm retrieval-eval -- --report-id <id>   # already-ingested report + overlay
```

CI (`.github/workflows/ci.yml` job `Retrieval eval (GCS + judge)`) runs
`--from-gcs` only when the retrieval harness, `searchReportDocuments`
implementation, or `.github/workflows/ci.yml` changes. It skips cleanly when Vertex / GCS secrets are
missing. GitHub Actions authenticates with Workload Identity Federation
(OIDC) — not a JSON service-account key (`constraints/iam.disableServiceAccountKeyCreation`).
Required Actions secrets:

- `GOOGLE_VERTEX_PROJECT`
- `GCP_WORKLOAD_IDENTITY_PROVIDER` (`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github`)
- `GCP_SERVICE_ACCOUNT_EMAIL` (the GitHub Actions SA, not the Vercel runtime SA)
- `RETRIEVAL_EVAL_GCS_BUCKET`

Do not add `GCP_SERVICE_ACCOUNT_KEY`. The job needs `permissions.id-token: write`.
The same WIF secrets are used by `.github/workflows/pdf-ingest-soak.yml`.
`--from-gcs` downloads the corpus from the bucket. It does **not** generate
or upload objects. Add new files with laptop ADC (`pnpm retrieval-eval:upload`
or `gsutil cp`), not GitHub Actions. The GitHub Actions SA needs
`roles/storage.objectViewer` on the eval bucket (not objectCreator).

Local ingest uses `ATTACHMENT_STORAGE_BACKEND=local` (the bucket is the
corpus source, not where CI writes attachment bytes). Runs write JSON
under `scripts/eval/retrieval-runs/` (gitignored).

Schema for a case:

```jsonc
{
  "id": "...",
  "query": "...",
  "kind": "identifier" | "locator" | "semantic",
  "passCriteria": "What a careful reader must conclude from the excerpts.",
  "gold": [
    { "filename": "dv-protocol-equipment.pdf", "page": 2, "mustContain": ["..."] }
  ],
  "mustNotContainAnywhere": ["..."], // optional deterministic leak check
  "notes": "..."
}
```

`passCriteria` is required. `gold` may be empty when the correct answer is
"not in this corpus." Vitest validates the JSON, the PDF anchors, and the
judge prompt (`scripts/eval/retrieval-*.test.ts`).

The protocol PDF's required-equipment page starts with enough UUT header
lines that a 900-character prefix never reaches the answering row — that
is the excerpt-truncation case phase 3.5 exists to pass. The judge must
fail header-only slices even when Recall@5 is 1.0.

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

## Phase 3.5 — excerpt quality + lexical fast path

**Done.** Three changes close the right-page / wrong-excerpt regression
without raising caps or re-ingesting ready files:

1. **`buildMatchCenteredSnippet()`** — search excerpts center on the query
   phrase (or longest matching token) instead of always truncating from
   character 0. `toSearchResult()` uses this for every `search_documents`
   hit.
2. **`collapseToBestChunkPerPage(query)`** — when multiple chunks from the
   same page compete, keep the one with the highest `lexicalMatchScore()`
   against the query, not the first row returned by RRF/SQL ordering.
3. **`lexicalChunkSearch()`** — for semantic/locator queries, run an
   `ILIKE` pass (phrase OR token-AND on `contextual_text` / `raw_text`)
   before hybrid search and merge those rows ahead of vector/keyword hits.
   When the lexical pass alone fills `limit` with positive scores, skip the
   query embedding (same fast-path shape as identifier queries).
4. **Quote over visual-interpretation** — Gemini layout summaries match
   query wording (“instruments on the executed table”) without naming the
   rows. Collapse keeps a `quote`/`transcript` chunk when one exists on
   that page. Snippets come from `raw_text`, not the contextual header.
5. **Locator ranking + tail snippets** — `dv-protocol-equipment.pdf page 2`
   boosts that file+page to the top. Filename/page-only queries excerpt the
   page tail so a 900-character window reaches the table below running
   headers.

Eval: `equipment-required-instrument` in `retrieval-cases.json` is the
synthetic version of that bug. The judge (and a 900-character prefix
fixture test on the generated PDF) fail if excerpts snap back to
header-only slices. `recallAtK` can still be 1.0.

## Phase 4 — file / span routing

**Done.** Before chunk search, identifier and locator queries load ready
files + stored outline spans and restrict to attachments / spans whose
filename, `document_summary`, or span `identifiers` match. Semantic
queries are unrestricted. If the routed pass is under `limit`, the rest
of the report is backfilled (whole-file routes are excluded from that
pass; span routes are not, so other pages of the same file can still
appear). `@` tags still pin then backfill and are not a hard filter —
routing is skipped when tags are present so a tagged file is never
dropped for missing the route.

## Phase 5 — embed batching / auto mode

**Done.** `search_documents` `queries[]` goes through
`searchReportDocumentsMany()`. Unique semantic strings share one
`embedMany`; a single query still uses `embed`. Identifier and locator
queries keep the exact / lexical skip-embed path. There is no new chat
`mode` enum — Document chat stays hybrid-with-ids.

## Phase 6 — reranker

**Done (deterministic).** Candidates are reordered with
`rerankHitsForQuery()` before slicing to `limit`: locator file/page
boost, then identifier-in-excerpt / filename, then `lexicalMatchScore`.
Ties keep original order. Do **not** add a cross-encoder. The synthetic
nine is not production-scale proof that a learned reranker is needed.
CI already uploads `retrieval-runs/` JSON; a Recall@5 trend series is
not leftover for this architecture.

## Locked non-goals

- Raising upload / page / report caps.
- Cross-report search.
- Force-reindex of ready attachments.
- LLM document-type labels.
- Replacing FTS with BM25 or moving vectors off Postgres.
- Prompt bump for server-side exact-id (no copy change).
