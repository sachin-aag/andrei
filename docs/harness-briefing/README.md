# Chat harness briefing (junior engineer)

Four illustrated PDFs for someone joining the report-chat control plane.
They explain **how the harness works today**, not the incident backlog.

If a briefing disagrees with code, trust the code — then fix the HTML here
and reprint the PDF.

Living plans (status, subtract-first work): [`../harness-plan.md`](../harness-plan.md),
[`../retrieval.md`](../retrieval.md) (read path), and
[`../document-ingest-pipeline.md`](../document-ingest-pipeline.md) (write path).

## Read in order

| # | PDF | What it covers |
|---|-----|----------------|
| 1 | [01-architecture.pdf](01-architecture.pdf) | Layers (harness vs retrieval vs Gemini), POST lifecycle, file map |
| 2 | [02-control-plane.pdf](02-control-plane.pdf) | `ChatTurnPlan`, intent, retrieval policy, `prepareReportChatStep`, F1 scenarios |
| 3 | [03-indexing-and-storage.pdf](03-indexing-and-storage.pdf) | Write path: upload → extract → chunk → embed. pgvector in the same Postgres. English FTS, not BM25 |
| 4 | [04-retrieval-and-grounding.pdf](04-retrieval-and-grounding.pdf) | Read path against those tables: hybrid search, search-loop hide rules, document-review phases, fact gate, compaction / 270s abort |

Mental model: the LLM proposes, the harness constrains, the engineer
Applies. Live report chat always writes `ai_fix` comments plus red/green
marks. Nothing lands in `report_sections` until Apply / Dismiss.

Retrieval is two briefings on purpose. **3** answers “do we have a vector
DB / BM25 / Elasticsearch, and how is a PDF stored?” **4** is the same
tables from the other direction: `searchReportDocuments` → RRF → citation.

## Reprint

HTML next to each PDF is the source. Chrome print-to-PDF:

```bash
google-chrome --headless=new --disable-gpu --no-sandbox \
  --no-pdf-header-footer \
  --print-to-pdf=docs/harness-briefing/01-architecture.pdf \
  docs/harness-briefing/01-architecture.html
```

Repeat for `02-control-plane`, `03-indexing-and-storage`, and
`04-retrieval-and-grounding`.
