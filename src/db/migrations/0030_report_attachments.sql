CREATE TYPE "public"."attachment_processing_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'attachment_uploaded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'attachment_deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE IF NOT EXISTS 'attachment';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text DEFAULT '' NOT NULL,
	"gcs_object_key" text NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" "attachment_processing_status" DEFAULT 'pending' NOT NULL,
	"extracted_text_key" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachments_report_id_idx" ON "report_attachments" USING btree ("report_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
