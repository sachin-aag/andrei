ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'worksheet_updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'analysis_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'analysis_updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'analysis_deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE IF NOT EXISTS 'analytics';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source" "document_revision_source" DEFAULT 'manual' NOT NULL,
	"kind" text DEFAULT 'worksheet' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"worksheet" jsonb NOT NULL,
	"analyses" jsonb NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_revisions" ADD CONSTRAINT "analytics_revisions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_revisions_report_revision_unique" ON "analytics_revisions" USING btree ("report_id","revision_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_revisions_report_created_idx" ON "analytics_revisions" USING btree ("report_id","created_at");
