DO $$ BEGIN
 CREATE TYPE "public"."document_revision_source" AS ENUM('agent_turn');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source" "document_revision_source" DEFAULT 'agent_turn' NOT NULL,
	"chat_session_id" text,
	"chat_message_id" text,
	"summary" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_revision_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"section" text NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_revision_sections" ADD CONSTRAINT "document_revision_sections_revision_id_document_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."document_revisions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_revisions_report_revision_unique" ON "document_revisions" USING btree ("report_id","revision_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_revisions_report_created_idx" ON "document_revisions" USING btree ("report_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_revision_sections_revision_section_unique" ON "document_revision_sections" USING btree ("revision_id","section");
