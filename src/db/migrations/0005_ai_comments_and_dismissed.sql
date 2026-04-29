-- Part 2 of the inline-AI-suggestion plan.
-- Comments now carry a `kind` discriminator and an optional FK back to the
-- evaluation that emitted them, plus a new `dismissed` status.

-- 1. Extend the comment_status enum with 'dismissed'.
ALTER TYPE "comment_status" ADD VALUE IF NOT EXISTS 'dismissed';
--> statement-breakpoint

-- 2. New enum for the comment author kind. Reserves AI suggestion types so
--    grammar/tone/removal/redraft can land later without another migration.
DO $$ BEGIN
  CREATE TYPE "comment_kind" AS ENUM (
    'human',
    'ai_fix',
    'ai_grammar',
    'ai_tone',
    'ai_removal',
    'ai_redraft'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 3. Add the new columns. Both have safe defaults so existing rows
--    backfill cleanly.
ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "kind" "comment_kind" NOT NULL DEFAULT 'human';
--> statement-breakpoint
ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "evaluation_id" text;
--> statement-breakpoint

-- 4. FK from comments.evaluation_id → criteria_evaluations.id (set null on
--    eval delete so we don't lose orphaned threads).
DO $$ BEGIN
  ALTER TABLE "comments"
    ADD CONSTRAINT "comments_evaluation_id_criteria_evaluations_id_fk"
    FOREIGN KEY ("evaluation_id")
    REFERENCES "public"."criteria_evaluations"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
