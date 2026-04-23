-- Convert criteria_evaluations.suggested_fix from text to jsonb { anchorText, replacementText }.
-- Existing string values become { anchorText: "", replacementText: <old> }.
ALTER TABLE "criteria_evaluations"
  ALTER COLUMN "suggested_fix" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "criteria_evaluations"
  ALTER COLUMN "suggested_fix" TYPE jsonb
  USING jsonb_build_object(
    'anchorText', '',
    'replacementText', COALESCE("suggested_fix", '')
  );
--> statement-breakpoint
ALTER TABLE "criteria_evaluations"
  ALTER COLUMN "suggested_fix" SET DEFAULT '{"anchorText":"","replacementText":""}'::jsonb;
--> statement-breakpoint
ALTER TABLE "criteria_evaluations"
  ALTER COLUMN "suggested_fix" SET NOT NULL;
