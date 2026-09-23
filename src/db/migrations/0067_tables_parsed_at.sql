-- Marks an ingest run whose pages have been through table detection.
--
-- Runs that predate `document_tables` have no parsed tables, and the Reprocess
-- button will not help: it only accepts failed attachments, not healthy ones.
-- Detection reads `document_pages.transcript`, which is already stored, so the
-- fix is to parse on demand the first time someone asks for a table. This
-- column is what keeps that from re-running on every request — including for
-- documents that genuinely contain no table.
ALTER TABLE "attachment_ingest_runs"
  ADD COLUMN IF NOT EXISTS "tables_parsed_at" timestamp with time zone;
