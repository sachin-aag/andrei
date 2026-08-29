ALTER TYPE "public"."document_revision_source" ADD VALUE IF NOT EXISTS 'manual';
--> statement-breakpoint
ALTER TABLE "document_revisions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "document_revisions" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "document_revisions" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "document_revisions" ALTER COLUMN "updated_at" SET NOT NULL;
