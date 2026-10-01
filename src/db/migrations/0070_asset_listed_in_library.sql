-- Report uploads stay off the vault until indexing succeeds.
-- Existing assets stay listed.
ALTER TABLE "attachment_assets"
  ADD COLUMN IF NOT EXISTS "listed_in_library" boolean DEFAULT true NOT NULL;
