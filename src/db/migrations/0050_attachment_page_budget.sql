CREATE TABLE IF NOT EXISTS "attachment_page_budget_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"monthly_page_limit" integer DEFAULT 100000 NOT NULL,
	"enforce_hard_limit" boolean DEFAULT true NOT NULL,
	"warning_threshold_percent" integer DEFAULT 80 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachment_page_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"year_month" text NOT NULL,
	"page_count" integer NOT NULL,
	"attachment_id" text NOT NULL,
	"report_id" text,
	"ingest_run_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachment_page_usage_events" ADD CONSTRAINT "attachment_page_usage_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachment_page_usage_events" ADD CONSTRAINT "attachment_page_usage_events_attachment_id_report_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."report_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachment_page_usage_events" ADD CONSTRAINT "attachment_page_usage_events_ingest_run_id_attachment_ingest_runs_id_fk" FOREIGN KEY ("ingest_run_id") REFERENCES "public"."attachment_ingest_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attachment_page_usage_events_ingest_run_unique" ON "attachment_page_usage_events" USING btree ("ingest_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_page_usage_events_year_month_idx" ON "attachment_page_usage_events" USING btree ("year_month");
--> statement-breakpoint
INSERT INTO "attachment_page_budget_settings" ("id", "monthly_page_limit", "enforce_hard_limit", "warning_threshold_percent")
VALUES ('default', 100000, true, 80)
ON CONFLICT ("id") DO NOTHING;
