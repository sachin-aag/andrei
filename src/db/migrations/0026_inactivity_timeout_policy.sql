ALTER TABLE "password_policy_settings"
ADD COLUMN IF NOT EXISTS "inactivity_timeout_minutes" integer DEFAULT 10 NOT NULL;

