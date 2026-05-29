ALTER TYPE "public"."comment_kind" ADD VALUE 'word_import' BEFORE 'ai_fix';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "source" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "external_author_name" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "external_author_initials" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "external_comment_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "external_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;