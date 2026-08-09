CREATE TYPE "public"."document_type" AS ENUM('investigation_report', 'design_verification');--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "document_type" "document_type" DEFAULT 'investigation_report' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "document_no" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "reports" SET
  "document_no" = "deviation_no",
  "metadata" = jsonb_build_object(
    'toolsUsed', COALESCE("tools_used", '{"sixM":false,"fiveWhy":false,"brainstorming":false}'::jsonb),
    'otherTools', COALESCE("other_tools", '')
  );--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "document_no" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "reports_deviation_no_unique";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "deviation_no";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "tools_used";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN IF EXISTS "other_tools";--> statement-breakpoint
CREATE UNIQUE INDEX "reports_document_no_unique" ON "reports" USING btree ("author_id","document_type","document_no");--> statement-breakpoint
ALTER TABLE "report_sections" ALTER COLUMN "section" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "criteria_evaluations" ALTER COLUMN "section" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "section" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "ai_feedback_responses" ALTER COLUMN "section" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "section_content_versions" ALTER COLUMN "section" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."section_type";
