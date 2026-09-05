CREATE TABLE IF NOT EXISTS "attachment_storage_budget_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"byte_limit" bigint DEFAULT 107374182400 NOT NULL,
	"enforce_hard_limit" boolean DEFAULT true NOT NULL,
	"warning_threshold_percent" integer DEFAULT 80 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "attachment_storage_budget_settings" ("id", "byte_limit", "enforce_hard_limit", "warning_threshold_percent")
VALUES ('default', 107374182400, true, 80)
ON CONFLICT ("id") DO NOTHING;
