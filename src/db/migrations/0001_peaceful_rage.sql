ALTER TABLE "comments" ADD COLUMN "content_path" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "from_pos" integer;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "to_pos" integer;