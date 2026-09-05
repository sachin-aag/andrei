CREATE TABLE IF NOT EXISTS "attachment_library_folders" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "parent_id" text,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_library_folders"
  ADD CONSTRAINT "attachment_library_folders_parent_id_attachment_library_folders_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."attachment_library_folders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_library_folders_owner_idx" ON "attachment_library_folders" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_library_folders_parent_idx" ON "attachment_library_folders" USING btree ("parent_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachment_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "library_folder_id" text,
  "filename" text NOT NULL,
  "description" text,
  "mime_type" text DEFAULT 'application/pdf' NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "sha256" text DEFAULT '' NOT NULL,
  "staging_object_key" text NOT NULL,
  "permanent_object_key" text NOT NULL,
  "gcs_generation" text,
  "crc32c" text,
  "page_count" integer,
  "processing_status" "attachment_processing_status" DEFAULT 'uploading' NOT NULL,
  "processing_progress" integer DEFAULT 0 NOT NULL,
  "processing_page" integer,
  "processing_error" text,
  "active_ingest_run_id" text,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachment_assets"
  ADD CONSTRAINT "attachment_assets_library_folder_id_attachment_library_folders_id_fk"
  FOREIGN KEY ("library_folder_id") REFERENCES "public"."attachment_library_folders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_assets_owner_idx" ON "attachment_assets" USING btree ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_assets_folder_idx" ON "attachment_assets" USING btree ("library_folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_assets_owner_active_idx" ON "attachment_assets" USING btree ("owner_id", "deleted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachment_access_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "asset_id" text NOT NULL,
  "grantee_user_id" text NOT NULL,
  "granted_by_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_access_grants"
  ADD CONSTRAINT "attachment_access_grants_asset_id_attachment_assets_id_fk"
  FOREIGN KEY ("asset_id") REFERENCES "public"."attachment_assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attachment_access_grants_asset_grantee_unique" ON "attachment_access_grants" USING btree ("asset_id", "grantee_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_access_grants_grantee_idx" ON "attachment_access_grants" USING btree ("grantee_user_id");
--> statement-breakpoint
ALTER TABLE "report_attachments" ADD COLUMN IF NOT EXISTS "asset_id" text;
--> statement-breakpoint
ALTER TABLE "report_attachments"
  ADD CONSTRAINT "report_attachments_asset_id_attachment_assets_id_fk"
  FOREIGN KEY ("asset_id") REFERENCES "public"."attachment_assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachments_asset_idx" ON "report_attachments" USING btree ("asset_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_attachments_report_asset_unique" ON "report_attachments" USING btree ("report_id", "asset_id");
--> statement-breakpoint
ALTER TABLE "attachment_ingest_runs" ADD COLUMN IF NOT EXISTS "asset_id" text;
--> statement-breakpoint
ALTER TABLE "attachment_ingest_runs"
  ADD CONSTRAINT "attachment_ingest_runs_asset_id_attachment_assets_id_fk"
  FOREIGN KEY ("asset_id") REFERENCES "public"."attachment_assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachment_ingest_runs_asset_idx" ON "attachment_ingest_runs" USING btree ("asset_id");
--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "asset_id" text;
--> statement-breakpoint
ALTER TABLE "document_pages"
  ADD CONSTRAINT "document_pages_asset_id_attachment_assets_id_fk"
  FOREIGN KEY ("asset_id") REFERENCES "public"."attachment_assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN IF NOT EXISTS "asset_id" text;
--> statement-breakpoint
ALTER TABLE "document_chunks"
  ADD CONSTRAINT "document_chunks_asset_id_attachment_assets_id_fk"
  FOREIGN KEY ("asset_id") REFERENCES "public"."attachment_assets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "attachment_assets" (
  "id",
  "owner_id",
  "filename",
  "description",
  "mime_type",
  "size_bytes",
  "sha256",
  "staging_object_key",
  "permanent_object_key",
  "gcs_generation",
  "crc32c",
  "page_count",
  "processing_status",
  "processing_progress",
  "processing_page",
  "processing_error",
  "active_ingest_run_id",
  "uploaded_at",
  "deleted_at"
)
SELECT
  ra."id",
  ra."uploaded_by_id",
  ra."filename",
  ra."description",
  ra."mime_type",
  ra."size_bytes",
  ra."sha256",
  ra."staging_object_key",
  ra."permanent_object_key",
  ra."gcs_generation",
  ra."crc32c",
  ra."page_count",
  ra."processing_status",
  ra."processing_progress",
  ra."processing_page",
  ra."processing_error",
  ra."active_ingest_run_id",
  ra."uploaded_at",
  ra."deleted_at"
FROM "report_attachments" ra
WHERE ra."asset_id" IS NULL
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "report_attachments" ra
SET "asset_id" = ra."id"
WHERE ra."asset_id" IS NULL;
--> statement-breakpoint
UPDATE "attachment_ingest_runs" air
SET "asset_id" = ra."asset_id"
FROM "report_attachments" ra
WHERE air."attachment_id" = ra."id"
  AND air."asset_id" IS NULL;
--> statement-breakpoint
UPDATE "document_pages" dp
SET "asset_id" = ra."asset_id"
FROM "report_attachments" ra
WHERE dp."attachment_id" = ra."id"
  AND dp."asset_id" IS NULL;
--> statement-breakpoint
UPDATE "document_chunks" dc
SET "asset_id" = ra."asset_id"
FROM "report_attachments" ra
WHERE dc."attachment_id" = ra."id"
  AND dc."asset_id" IS NULL;
