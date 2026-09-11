ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL;
