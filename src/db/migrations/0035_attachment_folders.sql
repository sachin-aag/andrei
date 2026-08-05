CREATE TABLE IF NOT EXISTS "report_attachment_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_attachments" ADD COLUMN IF NOT EXISTS "folder_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachment_folders_report_idx" ON "report_attachment_folders" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachment_folders_parent_idx" ON "report_attachment_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_attachments_folder_idx" ON "report_attachments" USING btree ("folder_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_attachment_folders" ADD CONSTRAINT "report_attachment_folders_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_attachment_folders" ADD CONSTRAINT "report_attachment_folders_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."report_attachment_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."report_attachment_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
