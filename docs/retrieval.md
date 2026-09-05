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
| 0 | Retrieval eval harness, synthetic GCS corpus, LLM judge | **done** |
| 1 | Persist deterministic page metadata | **done** |
| 2 | Persist outline spans; outline reads prefer stored spans | **done** |
| 3 | Exact-identifier retrieval, page collapse, skip embed when exact fills `limit` | **done** |
| 3.5 | Match-centered excerpts, best chunk per page, lexical fast path | **done** |
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
   (highest lexical overlap with the query, not chunk ordinal 0). Search
   excerpts are centered on the query match instead of always taking the
   first 900 characters of the winning chunk.
5. Semantic/locator queries also run a lexical `ILIKE` pass (phrase + token
   AND) before hybrid search. When those hits alone fill `limit` with
   positive lexical scores, skip `embedRetrievalQuery` (same fast-path shape
   as identifier queries).
6. `@` tags still pin then backfill. They are not a hard filter.
7. `readDocumentOutline` returns stored spans when the active ingest run
   has them; otherwise it builds spans from page transcripts.

Entry points: `src/lib/attachments/retrieval.ts`,
`src/lib/attachments/page-metadata.ts`,
`src/lib/attachments/page-outline.ts`,
`src/lib/attachments/run-document-ingest.ts`. Eval:
`pnpm retrieval-eval` (default `--dry-run` validates cases;
`--from-gcs` is the CI path; `--live` generates the same PDFs without
GCS; `--report-id` searches an already-ingested report).

## Phase 0 — eval harness

**Done.** `scripts/eval/retrieval-eval.ts` + `scripts/eval/retrieval-cases.json`
+ a synthetic corpus (`scripts/eval/retrieval-corpus.ts`).

The public cases are small on purpose: two born-digital PDFs that reproduce
the failure modes that matter (right page / wrong 900-character slice,
required-vs-executed tables, identifier lookup, cross-file leak, true
negative). They are not a customer attachment and are not the in-repo
SOP / Appendix B scans.

**Pass/fail** is an LLM judge (`scripts/eval/retrieval-judge.ts`,
`RETRIEVAL_JUDGE_PROMPT_VERSION`). Recall@5 is informational. A
`mustNotContainAnywhere` leak fails the case before the judge runs.

```bash
pnpm retrieval-eval -- --dry-run          # parse + print cases
pnpm retrieval-eval:upload                # one-time: write PDFs to the test bucket
pnpm retrieval-eval -- --from-gcs         # CI path: download, ingest, search, judge
pnpm retrieval-eval -- --live             # same PDFs, skip GCS (laptop + Vertex)
pnpm retrieval-eval -- --report-id <id>   # search an already-ingested report
```

CI (`.github/workflows/ci.yml` job `Retrieval eval (GCS + judge)`) runs
`--from-gcs` only when the retrieval harness or `searchReportDocuments`
implementation changes. It skips cleanly when Vertex / GCS secrets are
missing. Secrets: `GOOGLE_VERTEX_PROJECT`, `GCP_SERVICE_ACCOUNT_KEY`,
`RETRIEVAL_EVAL_GCS_BUCKET`. After changing the PDF builders, re-run
`pnpm retrieval-eval:upload`.

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

Eval: `equipment-required-instrument` in `retrieval-cases.json` is the
synthetic version of that bug. The judge (and a 900-character prefix
fixture test on the generated PDF) fail if excerpts snap back to
header-only slices. `recallAtK` can still be 1.0.

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
