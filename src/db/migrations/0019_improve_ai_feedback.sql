DROP TABLE IF EXISTS "criteria_review_submissions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "criteria_review_reports" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."criteria_review_status";--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ai_feedback_source_type" AS ENUM('existing_report', 'uploaded_docx');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ai_feedback_session_status" AS ENUM('evaluating', 'ready_for_review', 'reviewed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_feedback_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"submitted_by" text NOT NULL,
	"source_type" "ai_feedback_source_type" NOT NULL,
	"status" "ai_feedback_session_status" DEFAULT 'evaluating' NOT NULL,
	"source_label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_feedback_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"criterion_key" text NOT NULL,
	"section" "section_type" NOT NULL,
	"ai_status" "criterion_status" NOT NULL,
	"ai_reasoning" text DEFAULT '' NOT NULL,
	"criteria_evaluation_agreement" text,
	"reasoning_agreement" text,
	"human_comment" text DEFAULT '' NOT NULL,
	"suggested_status" "criterion_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_feedback_sessions" ADD CONSTRAINT "ai_feedback_sessions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_feedback_sessions" ADD CONSTRAINT "ai_feedback_sessions_submitted_by_workspace_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_feedback_responses" ADD CONSTRAINT "ai_feedback_responses_session_id_ai_feedback_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_feedback_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_feedback_sessions_report_submitter_unique" ON "ai_feedback_sessions" USING btree ("report_id","submitted_by");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_feedback_responses_session_criterion_unique" ON "ai_feedback_responses" USING btree ("session_id","criterion_key");
