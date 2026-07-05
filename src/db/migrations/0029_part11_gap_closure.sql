ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "deleted_by_id" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "reviewed_by_id" text;--> statement-breakpoint
ALTER TABLE "electronic_signatures" ADD COLUMN IF NOT EXISTS "content_hash" text;--> statement-breakpoint
ALTER TABLE "electronic_signatures" ADD COLUMN IF NOT EXISTS "signed_version_seq" integer;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "deactivated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'qa';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retention_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"report_retention_days" integer DEFAULT 2555 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "retention_settings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'report_purged';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'user_deactivated';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'user_reactivated';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'user_unlocked';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
