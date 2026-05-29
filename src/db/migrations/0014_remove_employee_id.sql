ALTER TABLE "criteria_review_reviewers" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
UPDATE "criteria_review_reviewers" r SET "email" = w."email" FROM "workspace_users" w WHERE w."employee_id" = r."employee_id";--> statement-breakpoint
UPDATE "criteria_review_reviewers" SET "email" = "id" WHERE "email" IS NULL;--> statement-breakpoint
ALTER TABLE "criteria_review_reviewers" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "workspace_users_employee_id_unique";--> statement-breakpoint
ALTER TABLE "workspace_users" DROP COLUMN IF EXISTS "employee_id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_users_email_unique" ON "workspace_users" ("email");--> statement-breakpoint
DROP INDEX IF EXISTS "criteria_review_reviewers_employee_id_unique";--> statement-breakpoint
ALTER TABLE "criteria_review_reviewers" DROP COLUMN IF EXISTS "employee_id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "criteria_review_reviewers_email_unique" ON "criteria_review_reviewers" ("email");
