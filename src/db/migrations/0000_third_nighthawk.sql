CREATE TYPE "public"."comment_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."criterion_status" AS ENUM('met', 'partially_met', 'not_met', 'not_evaluated');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'submitted', 'in_review', 'feedback', 'approved');--> statement-breakpoint
CREATE TYPE "public"."section_type" AS ENUM('define', 'measure', 'analyze', 'improve', 'control', 'documents_reviewed', 'attachments');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"section_id" text,
	"section" "section_type",
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"anchor_text" text DEFAULT '' NOT NULL,
	"status" "comment_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criteria_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"section_id" text NOT NULL,
	"section" "section_type" NOT NULL,
	"criterion_key" text NOT NULL,
	"criterion_label" text NOT NULL,
	"status" "criterion_status" DEFAULT 'not_evaluated' NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"suggested_fix" text DEFAULT '' NOT NULL,
	"fix_applied" boolean DEFAULT false NOT NULL,
	"bypassed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"section" "section_type" NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"deviation_no" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"tools_used" jsonb DEFAULT '{"sixM":false,"fiveWhy":false,"brainstorming":false}'::jsonb NOT NULL,
	"other_tools" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"author_id" text NOT NULL,
	"assigned_manager_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_section_id_report_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria_evaluations" ADD CONSTRAINT "criteria_evaluations_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria_evaluations" ADD CONSTRAINT "criteria_evaluations_section_id_report_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."report_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_section_unique" ON "report_sections" USING btree ("report_id","section");