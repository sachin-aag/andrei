CREATE TABLE IF NOT EXISTS "statistical_workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"worksheet" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "statistical_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text DEFAULT 'capability_sixpack_normal' NOT NULL,
	"title" text NOT NULL,
	"config" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "statistical_workspaces" ADD CONSTRAINT "statistical_workspaces_owner_id_workspace_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "statistical_analyses" ADD CONSTRAINT "statistical_analyses_workspace_id_statistical_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."statistical_workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statistical_workspaces_owner_updated_idx" ON "statistical_workspaces" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "statistical_analyses_workspace_created_idx" ON "statistical_analyses" USING btree ("workspace_id","created_at");
