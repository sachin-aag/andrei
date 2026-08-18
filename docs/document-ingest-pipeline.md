# Document ingest pipeline

How PDF/DOCX attachments become searchable evidence for report chat. Extract and embed are **Vertex-only** (`GOOGLE_VERTEX_PROJECT`). A Vercel AI Gateway key is not enough. Local/E2E stub: `ALLOW_TEST_STUB_DOCUMENT_INGEST`.

Entry points: `startDocumentIngest` → `runDocumentIngest`. Chat later reads `document_pages` / `document_chunks` via hybrid retrieval.

```mermaid
flowchart TD
  subgraph Upload["1. Reserve and upload"]
    A["POST .../attachments/upload-url"] --> B["reserveAttachmentUpload<br/>quota lock on report row"]
    B --> C["report_attachments<br/>status: uploading"]
    C --> D["Browser PUT to staging object<br/>GCS resumable or local"]
    D --> E["POST .../attachments/:id/finalize"]
  end

  subgraph Finalize["2. Validate and promote"]
    E --> F["Claim status: validating"]
    F --> G{"Size, MIME, PDF/DOCX<br/>structure, malware scan"}
    G -->|fail| H["status: failed"]
    G -->|ok| I["Promote staging → permanent<br/>sha256 + generation"]
    I --> J["status: queued"]
    J --> K["startDocumentIngest"]
  end

  subgraph Schedule["3. Claim and schedule"]
    K --> L{"ALLOW_TEST_STUB<br/>_DOCUMENT_INGEST?"}
    L -->|yes| M["Stub page + chunk<br/>status: ready"]
    L -->|no| N["claimDocumentIngestStart<br/>queued → processing"]
    N --> O{"DOCUMENT_INGEST_MODE<br/>or Vercel Preview?"}
    O -->|inline / preview| P["next/server after()<br/>runDocumentIngest"]
    O -->|workflow| Q["Vercel Workflow + Queues"]
    Q -->|start fails| P
    Q --> R["documentIngestStep<br/>use step"]
    R --> S["runDocumentIngest"]
    P --> S
  end

  subgraph Run["4. Extract, chunk, embed"]
    S --> T{"MIME kind"}
    T -->|pdf| U["PDF path"]
    T -->|docx| V["DOCX path"]
    U --> W["chunkAndEmbedRun"]
    V --> W
    W --> X["Vertex embeddings<br/>gemini-embedding-001<br/>768-d, batches of 32"]
    X --> Y["document_chunks + FTS index"]
    Y --> Z["Supersede prior ready run<br/>activeIngestRunId<br/>status: ready"]
  end

  S -->|deleted / generation change| AA["run: cancelled"]
  S -->|extract/embed error| AB["run: failed"]
```

## Attachment status

```mermaid
stateDiagram-v2
  [*] --> uploading: reserve upload-url
  uploading --> validating: finalize claims row
  failed --> validating: retry finalize
  validating --> queued: promote + checksums
  validating --> failed: validation / scan
  queued --> processing: claim ingest start
  processing --> ready: markRunReady
  processing --> failed: markRunTerminal
  ready --> [*]
  failed --> queued: reprocess
```

Ingest **run** statuses (separate table): `pending` → `running` → `ready` | `failed` | `cancelled`. A new successful run marks the previous `ready` run `superseded`.

## PDF path

Born-digital PDFs stay on ~3-page sequential batches (max 5, or smaller if the slice exceeds ~18 MB) so Gemini can add visual context with carry-forward notes.

Scans and mixed PDFs with Document AI configured split into **15-page** batches (or smaller if a slice exceeds 40 MB). Ingest processes up to **3 of those batches in parallel**. Gemini vision still runs only on weak OCR pages, one page at a time. Previous batch `batchSummary` / `continuationNote` are passed forward on the sequential (born-digital) path only.

```mermaid
flowchart TD
  A["Read permanent PDF"] --> B["splitPdfIntoBatches"]
  B --> C["Write temp batch objects<br/>document_ingest_batches pending"]
  C --> D["Pending batches"]
  D --> E["Waves of 3 for OCR batches,<br/>else one batch at a time"]
  E --> F["extractPdfBatch"]
  F --> G["Upsert document_pages<br/>for that page range"]
  G --> H["Batch ready + progress 10→80"]
  H --> D
  H --> I{"Any usable pages?"}
  I -->|no / all gaps| J["Throw: no extract output"]
  I -->|yes| K["documentSummary =<br/>join batch summaries"]
  K --> L["chunkAndEmbedRun"]
  L --> M["Cleanup temp batch objects"]
```

### Extract modes and recovery

Born-digital pages use the PDF text layer as the transcript. Scans go through Document AI Enterprise OCR when `DOCUMENT_AI_PROCESSOR_ID` is set; weak or failed OCR pages fall back to Gemini vision (rotate/tiles). Mixed PDFs OCR the scan pages in one request and keep the text layer for born-digital pages.

```mermaid
flowchart TD
  A["extractPdfBatch"] --> B{"Text layer readable<br/>for every page in batch?"}
  B -->|all pages have text| C["text-layer mode"]
  B -->|no usable text| D["scan path"]
  B -->|some pages only| E["mixed: OCR scans together"]

  C --> F["Parser supplies transcript"]
  F --> G["Vertex insight pass<br/>visuals, pageContext, summary"]
  G -->|insight fails| H["Keep transcript<br/>recovery: text-layer-only"]

  D --> OCR{"Document AI processor configured?"}
  OCR -->|yes| I["Enterprise OCR"]
  I -->|strong transcript| J["recovery: ocr-document-ai"]
  I -->|weak / missing / API error| K["Gemini vision"]
  OCR -->|no| K
  K --> L["salvage, per-page, rotate/tile"]
  L -->|still failing| M["page-gap placeholder<br/>later batches still run"]

  E --> C
  E --> D
```

Extract model: `gemini-3.1-flash-lite` at Vertex location `global` (`DOCUMENT_EXTRACT_LOCATION`). OCR uses a **regional** Document AI processor (`DOCUMENT_AI_LOCATION=us` or `eu` — never `global`). Embeddings stay on `GOOGLE_VERTEX_LOCATION` (often `us-central1`). Those locations must not be conflated. Prompt version: `doc-extract-v4`.

## DOCX path

No real page model. Mammoth extracts body text; OOXML rasters are described with the same Vertex extract model as PDF vision.

```mermaid
flowchart TD
  A["Read permanent DOCX"] --> B["mammoth.extractRawText"]
  B --> C["Split on paragraph breaks<br/>into ~6k-char pseudo-pages"]
  A --> D["extractDocxEmbeddedImages"]
  D --> E{"Any embedded rasters?"}
  E -->|yes| F["describeDocxImages<br/>Vertex extract model"]
  F --> G["Assign images to pseudo-pages"]
  E -->|no| H["Text-only pages"]
  C --> I["Insert document_pages<br/>transcript + visualInterpretation"]
  G --> I
  H --> I
  I --> J["documentSummary = raw text<br/>truncated to 12k chars"]
  J --> K["chunkAndEmbedRun"]
```

## Chunk and embed

Shared by both kinds. Transcript and visual interpretation are chunked separately (`quote` vs `visual_interpretation`).

```mermaid
flowchart LR
  A["document_pages"] --> B["chunkDocumentPages"]
  B --> C["~3200 chars, 240 overlap<br/>split on paragraph / sentence"]
  C --> D["contextualText =<br/>filename + page + pageContext<br/>+ raw chunk"]
  D --> E["embedDocumentChunks"]
  E --> F["document_chunks.embedding<br/>vector 768"]
  D --> G["GIN FTS on contextual_text<br/>english to_tsvector"]
```

## What chat reads

The report body is **not** in `document_chunks`. Ready attachments are listed in the chat context map (filename + sanitized `documentSummary`). Each turn may also run fail-soft kickoff retrieval.

```mermaid
flowchart TD
  A["Chat turn"] --> B["listReadyDocumentsForReport<br/>activeIngestRunId + status ready"]
  A --> C["buildAutoEvidence ≤1.5s"]
  C --> D["searchReportDocuments"]
  D --> E["Vector: embedding <=>"]
  D --> F["Keyword: websearch_to_tsquery<br/>OR tokens on contextual_text"]
  E --> G["RRF merge"]
  F --> G
  G --> H["Citations in the prompt"]

  A --> I["Tools"]
  I --> J["search_documents"]
  I --> K["document_outline → pages"]
  I --> L["read_document_page"]
  J --> D
```

## Tables

| Table | Role |
| --- | --- |
| `report_attachments` | File row, `processing_status`, `active_ingest_run_id`, generation |
| `attachment_ingest_runs` | One extract/embed attempt; `document_summary` |
| `document_ingest_batches` | PDF page slices + temp object keys (PDF only) |
| `document_pages` | Transcript, visual interpretation, `page_context` |
| `document_chunks` | Searchable spans + 768-d embedding |

## Safety rails

- `gcsGeneration` is pinned at start. Delete or replace mid-run → `cancelled`.
- Concurrent finalize/start is serialized with `FOR UPDATE` on the attachment (and on the report for quota).
- Workflow `start()` failure falls back to inline `after()` so uploads do not stick on queued.
- Stale `processing` rows can be reclaimed, then `POST .../reprocess` re-queues.
- Untrusted model text (`documentSummary`, `pageContext`) is sanitized in chat/tools, not in the attachments package.
