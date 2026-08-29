ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;
