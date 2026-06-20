ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "password_expiry_warning_dismissed_until" timestamp with time zone;--> statement-breakpoint
UPDATE "workspace_users"
SET "password_changed_at" = now()
WHERE "password_hash" IS NOT NULL
  AND "password_changed_at" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_workspace_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_history_user_created_at_idx" ON "password_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_policy_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"min_length" integer DEFAULT 6 NOT NULL,
	"require_letter" boolean DEFAULT true NOT NULL,
	"require_number" boolean DEFAULT true NOT NULL,
	"require_special" boolean DEFAULT true NOT NULL,
	"expiry_days" integer DEFAULT 90 NOT NULL,
	"warning_days" integer DEFAULT 14 NOT NULL,
	"failed_login_attempt_limit" integer DEFAULT 3 NOT NULL,
	"password_history_limit" integer DEFAULT 3 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "password_policy_settings" (
	"id",
	"min_length",
	"require_letter",
	"require_number",
	"require_special",
	"expiry_days",
	"warning_days",
	"failed_login_attempt_limit",
	"password_history_limit"
)
VALUES ('default', 6, true, true, true, 90, 14, 3, 3)
ON CONFLICT ("id") DO NOTHING;
