ALTER TABLE "statistical_workspaces" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
