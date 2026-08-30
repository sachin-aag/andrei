DO $$ BEGIN
 CREATE TYPE "public"."product_tour_status" AS ENUM('not_started', 'in_progress', 'completed', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "product_tour_status" "product_tour_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "product_tour_step_id" text;
