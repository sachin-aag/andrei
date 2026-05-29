ALTER TYPE "public"."comment_kind" ADD VALUE IF NOT EXISTS 'word_import';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "external_author_name" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "external_author_initials" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "external_comment_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "external_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "locked" boolean DEFAULT false NOT NULL;
