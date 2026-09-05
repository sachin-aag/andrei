ALTER TABLE "attachment_library_folders"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_library_folders_owner_archived_idx"
  ON "attachment_library_folders" USING btree ("owner_id", "archived_at");
