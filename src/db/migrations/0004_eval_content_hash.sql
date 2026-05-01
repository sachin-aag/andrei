-- Track the section content hash at evaluation time so we can dedupe LLM calls
-- when nothing has changed (auto-eval).
ALTER TABLE "criteria_evaluations"
  ADD COLUMN IF NOT EXISTS "evaluated_content_hash" text NOT NULL DEFAULT '';
