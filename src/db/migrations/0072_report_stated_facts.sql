ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'stated_fact_added';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'stated_fact_deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE IF NOT EXISTS 'stated_fact';--> statement-breakpoint
CREATE TABLE "report_stated_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"entity_text" text DEFAULT '' NOT NULL,
	"entity_normalized" text DEFAULT '' NOT NULL,
	"value_text" text NOT NULL,
	"value_kind" text NOT NULL,
	"value_normalized" text NOT NULL,
	"source_text" text NOT NULL,
	"source_message_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_by" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "report_stated_facts" ADD CONSTRAINT "report_stated_facts_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_stated_facts" ADD CONSTRAINT "report_stated_facts_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_stated_facts_report_live_idx" ON "report_stated_facts" USING btree ("report_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_stated_facts_live_unique" ON "report_stated_facts" USING btree ("report_id","entity_normalized","value_normalized") WHERE "report_stated_facts"."deleted_at" IS NULL;
