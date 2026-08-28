DO $$ BEGIN
 CREATE TYPE "public"."ai_usage_feature" AS ENUM(
  'criteria_evaluation',
  'suggestion_generation',
  'document_chat',
  'analytics_chat',
  'document_ingest',
  'document_embedding',
  'document_review_extract',
  'math_extraction',
  'chart_extraction',
  'docx_image_description'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_budget_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"monthly_budget_usd" real DEFAULT 500 NOT NULL,
	"enforce_hard_limit" boolean DEFAULT true NOT NULL,
	"warning_threshold_percent" integer DEFAULT 80 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"year_month" text NOT NULL,
	"feature" "ai_usage_feature" NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real NOT NULL,
	"report_id" text,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_workspace_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_events_year_month_idx" ON "ai_usage_events" USING btree ("year_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_events_year_month_feature_idx" ON "ai_usage_events" USING btree ("year_month","feature");
--> statement-breakpoint
INSERT INTO "ai_budget_settings" ("id", "monthly_budget_usd", "enforce_hard_limit", "warning_threshold_percent")
VALUES ('default', 500, true, 80)
ON CONFLICT ("id") DO NOTHING;
