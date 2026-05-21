DO $$ BEGIN
 CREATE TYPE "public"."criteria_review_status" AS ENUM('pending', 'in_progress', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "criteria_review_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"source_file" text NOT NULL,
	"deviation_no" text NOT NULL,
	"report_date" text NOT NULL,
	"prompt_version" text NOT NULL,
	"total_criterion_count" integer NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb NOT NULL,
	"human_review_status" "criteria_review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "criteria_review_reviewers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"employee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "criteria_review_reviewers_employee_id_unique" ON "criteria_review_reviewers" USING btree ("employee_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "criteria_review_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"status" "criteria_review_status" DEFAULT 'pending' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "criteria_review_submissions" ADD CONSTRAINT "criteria_review_submissions_report_id_criteria_review_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."criteria_review_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "criteria_review_submissions" ADD CONSTRAINT "criteria_review_submissions_reviewer_id_criteria_review_reviewers_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."criteria_review_reviewers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "criteria_review_submissions_report_reviewer_unique" ON "criteria_review_submissions" USING btree ("report_id","reviewer_id");
