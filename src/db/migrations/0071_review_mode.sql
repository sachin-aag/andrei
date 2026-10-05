ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'review_check_run';
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'review_finding_verified';
--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE IF NOT EXISTS 'review';
--> statement-breakpoint
ALTER TYPE "public"."ai_usage_feature" ADD VALUE IF NOT EXISTS 'review_check';
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."review_check_run_status" AS ENUM('running', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."review_finding_kind" AS ENUM('fixable', 'needs_human');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."review_finding_status" AS ENUM('open', 'resolved', 'dismissed', 'verified');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."review_finding_severity" AS ENUM('info', 'warning', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_check_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"check_id" text NOT NULL,
	"status" "review_check_run_status" DEFAULT 'running' NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"check_id" text NOT NULL,
	"run_id" text NOT NULL,
	"section" text,
	"content_path" text,
	"anchor_text" text DEFAULT '' NOT NULL,
	"message" text NOT NULL,
	"severity" "review_finding_severity" DEFAULT 'warning' NOT NULL,
	"kind" "review_finding_kind" NOT NULL,
	"comment_id" text,
	"status" "review_finding_status" DEFAULT 'open' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_check_runs" ADD CONSTRAINT "review_check_runs_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_run_id_review_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."review_check_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_check_runs_report_check_started_idx" ON "review_check_runs" USING btree ("report_id","check_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_findings_report_status_idx" ON "review_findings" USING btree ("report_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_findings_report_check_idx" ON "review_findings" USING btree ("report_id","check_id");
