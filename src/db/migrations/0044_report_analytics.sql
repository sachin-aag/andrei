DELETE FROM "statistical_analyses";
--> statement-breakpoint
DELETE FROM "statistical_workspaces";
--> statement-breakpoint
ALTER TABLE "statistical_workspaces" DROP CONSTRAINT IF EXISTS "statistical_workspaces_owner_id_workspace_users_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "statistical_workspaces_owner_updated_idx";
--> statement-breakpoint
ALTER TABLE "statistical_workspaces" DROP COLUMN IF EXISTS "owner_id";
--> statement-breakpoint
ALTER TABLE "statistical_workspaces" ADD COLUMN IF NOT EXISTS "report_id" text;
--> statement-breakpoint
ALTER TABLE "statistical_workspaces" ALTER COLUMN "report_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "statistical_workspaces" ALTER COLUMN "name" SET DEFAULT 'Worksheet';
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "statistical_workspaces" ADD CONSTRAINT "statistical_workspaces_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "statistical_workspaces_report_id_unique" ON "statistical_workspaces" USING btree ("report_id");
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "surface" text DEFAULT 'report' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "chat_sessions_report_updated_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_sessions_report_surface_updated_idx" ON "chat_sessions" USING btree ("report_id","surface","updated_at");
