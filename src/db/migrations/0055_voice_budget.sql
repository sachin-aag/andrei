ALTER TYPE "public"."ai_usage_feature" ADD VALUE IF NOT EXISTS 'voice_transcribe';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_budget_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"monthly_minute_limit" integer DEFAULT 100000 NOT NULL,
	"enforce_hard_limit" boolean DEFAULT true NOT NULL,
	"warning_threshold_percent" integer DEFAULT 80 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"year_month" text NOT NULL,
	"audio_seconds" integer NOT NULL,
	"report_id" text,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_usage_events" ADD CONSTRAINT "voice_usage_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_usage_events" ADD CONSTRAINT "voice_usage_events_user_id_workspace_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_usage_events_year_month_idx" ON "voice_usage_events" USING btree ("year_month");
--> statement-breakpoint
INSERT INTO "voice_budget_settings" ("id", "monthly_minute_limit", "enforce_hard_limit", "warning_threshold_percent")
VALUES ('default', 100000, true, 80)
ON CONFLICT ("id") DO NOTHING;
