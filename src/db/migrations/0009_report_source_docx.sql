CREATE TABLE IF NOT EXISTS "report_source_docx" (
	"report_id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_source_docx" ADD CONSTRAINT "report_source_docx_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
