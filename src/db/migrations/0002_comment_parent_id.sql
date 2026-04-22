ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "parent_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
