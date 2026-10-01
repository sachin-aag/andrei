-- Structured storage for tables recovered from page transcripts.
--
-- Instrument prints (SCADA historian exports, chromatography runs, datalogger
-- dumps) are tables of numbers that the retrieval path cannot serve: every page
-- embeds to nearly the same point and FTS on "192.4" is noise. Detection is
-- deterministic over text already in `document_pages.transcript`, so this adds
-- no model cost — it turns prose that is already exact back into data.
CREATE TABLE IF NOT EXISTS "document_tables" (
  "id" text PRIMARY KEY NOT NULL,
  "ingest_run_id" text NOT NULL REFERENCES "attachment_ingest_runs"("id") ON DELETE CASCADE,
  "attachment_id" text NOT NULL REFERENCES "report_attachments"("id") ON DELETE CASCADE,
  "asset_id" text REFERENCES "attachment_assets"("id") ON DELETE CASCADE,
  "report_id" text NOT NULL REFERENCES "reports"("id") ON DELETE CASCADE,
  "ordinal" integer NOT NULL,
  "columns" jsonb NOT NULL,
  "signature" text NOT NULL,
  "page_start" integer NOT NULL,
  "page_end" integer NOT NULL,
  "row_count" integer NOT NULL,
  "truncated" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_tables_run_ordinal_unique"
  ON "document_tables" ("ingest_run_id", "ordinal");
CREATE INDEX IF NOT EXISTS "document_tables_report_idx"
  ON "document_tables" ("report_id");
CREATE INDEX IF NOT EXISTS "document_tables_attachment_idx"
  ON "document_tables" ("attachment_id");

CREATE TABLE IF NOT EXISTS "document_table_rows" (
  "id" text PRIMARY KEY NOT NULL,
  "table_id" text NOT NULL REFERENCES "document_tables"("id") ON DELETE CASCADE,
  "ordinal" integer NOT NULL,
  "page_number" integer NOT NULL,
  "values" text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_table_rows_table_ordinal_unique"
  ON "document_table_rows" ("table_id", "ordinal");
