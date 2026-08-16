DROP INDEX IF EXISTS "document_chunks_contextual_text_fts_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_contextual_text_fts_en_idx"
  ON "document_chunks" USING gin (to_tsvector('english', "contextual_text"));
