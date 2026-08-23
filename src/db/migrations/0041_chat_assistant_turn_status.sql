DO $$ BEGIN
 CREATE TYPE "public"."chat_assistant_turn_status" AS ENUM('idle', 'running', 'cancel_requested');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "assistant_turn_status" "chat_assistant_turn_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "assistant_turn_started_at" timestamp with time zone;
