CREATE TABLE IF NOT EXISTS "report_managers" (
  "report_id" text NOT NULL,
  "manager_id" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "report_managers_report_id_manager_id_pk" PRIMARY KEY("report_id","manager_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "report_managers" ADD CONSTRAINT "report_managers_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "report_managers" ADD CONSTRAINT "report_managers_manager_id_workspace_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_managers_manager_idx" ON "report_managers" USING btree ("manager_id");
--> statement-breakpoint
INSERT INTO "report_managers" ("report_id", "manager_id", "sort_order")
SELECT r."id", r."assigned_manager_id", 0
FROM "reports" r
INNER JOIN "workspace_users" w ON w."id" = r."assigned_manager_id"
WHERE r."assigned_manager_id" IS NOT NULL
  AND w."role" = 'manager'
ON CONFLICT DO NOTHING;
