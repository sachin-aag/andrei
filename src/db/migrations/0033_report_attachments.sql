CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."attachment_processing_status" AS ENUM('uploading', 'validating', 'queued', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attachment_ingest_run_status" AS ENUM('pending', 'running', 'ready', 'failed', 'superseded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_ingest_batch_status" AS ENUM('pending', 'running', 'ready', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."document_chunk_source_kind" AS ENUM('quote', 'visual_interpretation');--> statement-breakpoint
CREATE TYPE "public"."storage_outbox_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'attachment_uploaded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'attachment_deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'attachment_reprocessed';--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE IF NOT EXISTS 'attachment';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"sha256" text DEFAULT '' NOT NULL,
	"staging_object_key" text NOT NULL,
	"permanent_object_key" text NOT NULL,
	"gcs_generation" text,
	"crc32c" text,
	"page_count" integer,
	"processing_status" "attachment_processing_status" DEFAULT 'uploading' NOT NULL,
	"processing_progress" integer DEFAULT 0 NOT NULL,
	"processing_error" text,
	"active_ingest_run_id" text,
	"uploaded_by_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachment_ingest_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"attachment_id" text NOT NULL,
	"report_id" text NOT NULL,
	"status" "attachment_ingest_run_status" DEFAULT 'pending' NOT NULL,
	"parser_version" text NOT NULL,
	"extract_model_id" text NOT NULL,
	"extract_prompt_version" text NOT NULL,
	"embedding_model_id" text NOT NULL,
	"embedding_dimensions" integer DEFAULT 768 NOT NULL,
	"source_generation" text NOT NULL,
	"page_count" integer,
	"batch_count" integer,
	"completed_batch_count" integer DEFAULT 0 NOT NULL,
	"document_summary" text,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_ingest_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"ingest_run_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"report_id" text NOT NULL,
	"batch_index" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"step_key" text NOT NULL,
	"temp_object_key" text,
	"status" "document_ingest_batch_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"batch_summary" text,
	"continuation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"ingest_run_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"report_id" text NOT NULL,
	"page_number" integer NOT NULL,
	"printed_page_label" text,
	"transcript" text DEFAULT '' NOT NULL,
	"visual_interpretation" text DEFAULT '' NOT NULL,
	"page_context" text,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"ingest_run_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"report_id" text NOT NULL,
	"page_id" text NOT NULL,
	"page_number" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"raw_text" text NOT NULL,
	"contextual_text" text NOT NULL,
	"source_kind" "document_chunk_source_kind" NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"gcs_generation" text,
	"report_id" text,
	"attachment_id" text,
	"status" "storage_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachments_report_id_idx" ON "report_attachments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachments_report_active_idx" ON "report_attachments" USING btree ("report_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_ingest_runs_attachment_idx" ON "attachment_ingest_runs" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_ingest_runs_report_idx" ON "attachment_ingest_runs" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_ingest_batches_run_batch_unique" ON "document_ingest_batches" USING btree ("ingest_run_id","batch_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_ingest_batches_step_key_unique" ON "document_ingest_batches" USING btree ("step_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_pages_run_page_unique" ON "document_pages" USING btree ("ingest_run_id","page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_pages_report_idx" ON "document_pages" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_chunks_run_page_ordinal_unique" ON "document_chunks" USING btree ("ingest_run_id","page_number","ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_report_idx" ON "document_chunks" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_attachment_idx" ON "document_chunks" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_outbox_status_idx" ON "storage_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_contextual_text_fts_idx" ON "document_chunks" USING gin (to_tsvector('simple', "contextual_text"));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachment_ingest_runs" ADD CONSTRAINT "attachment_ingest_runs_attachment_id_report_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."report_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachment_ingest_runs" ADD CONSTRAINT "attachment_ingest_runs_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_active_ingest_run_id_fk" FOREIGN KEY ("active_ingest_run_id") REFERENCES "public"."attachment_ingest_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_ingest_batches" ADD CONSTRAINT "document_ingest_batches_ingest_run_id_fk" FOREIGN KEY ("ingest_run_id") REFERENCES "public"."attachment_ingest_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_ingest_batches" ADD CONSTRAINT "document_ingest_batches_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."report_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_ingest_batches" ADD CONSTRAINT "document_ingest_batches_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_ingest_run_id_fk" FOREIGN KEY ("ingest_run_id") REFERENCES "public"."attachment_ingest_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."report_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_ingest_run_id_fk" FOREIGN KEY ("ingest_run_id") REFERENCES "public"."attachment_ingest_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."report_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."document_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
