TRUNCATE TABLE "criteria_review_submissions";--> statement-breakpoint
ALTER TABLE "criteria_review_submissions" DROP CONSTRAINT IF EXISTS "criteria_review_submissions_reviewer_id_criteria_review_reviewers_id_fk";--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "criteria_review_submissions" ADD CONSTRAINT "criteria_review_submissions_reviewer_id_workspace_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "criteria_review_reviewers";
