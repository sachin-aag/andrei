CREATE TABLE IF NOT EXISTS "user_activity_days" (
	"user_id" text NOT NULL,
	"day_utc" date NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_days_pk" PRIMARY KEY ("user_id", "day_utc")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_activity_days" ADD CONSTRAINT "user_activity_days_user_id_workspace_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_activity_days_day_utc_idx" ON "user_activity_days" USING btree ("day_utc");
