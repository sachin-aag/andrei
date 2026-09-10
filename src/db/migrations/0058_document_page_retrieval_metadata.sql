ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "outline_title" text;
--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "identifiers" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "has_table" boolean;
--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "has_figure" boolean;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_pages_identifiers_gin_idx" ON "document_pages" USING gin ("identifiers");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_outline_spans" (
	"id" text PRIMARY KEY NOT NULL,
	"ingest_run_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"report_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"identifiers" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_outline_spans" ADD CONSTRAINT "document_outline_spans_ingest_run_id_attachment_ingest_runs_id_fk" FOREIGN KEY ("ingest_run_id") REFERENCES "public"."attachment_ingest_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_outline_spans" ADD CONSTRAINT "document_outline_spans_attachment_id_report_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."report_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_outline_spans" ADD CONSTRAINT "document_outline_spans_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_outline_spans_run_ordinal_unique" ON "document_outline_spans" USING btree ("ingest_run_id","ordinal");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_outline_spans_report_attachment_run_idx" ON "document_outline_spans" USING btree ("report_id","attachment_id","ingest_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_outline_spans_identifiers_gin_idx" ON "document_outline_spans" USING gin ("identifiers");
