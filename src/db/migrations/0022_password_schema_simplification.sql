ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "password_history" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "password_reset_token_hash" text;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspace_users" ADD COLUMN IF NOT EXISTS "password_reset_token_created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "workspace_users" w
SET "password_history" = sub.hashes
FROM (
  SELECT "user_id", array_agg("password_hash" ORDER BY "created_at" DESC) AS hashes
  FROM "password_history"
  GROUP BY "user_id"
) sub
WHERE w."id" = sub."user_id";--> statement-breakpoint
UPDATE "workspace_users" w
SET
  "password_reset_token_hash" = t."token_hash",
  "password_reset_token_expires_at" = t."expires_at",
  "password_reset_token_created_at" = t."created_at"
FROM (
  SELECT DISTINCT ON ("email") "email", "token_hash", "expires_at", "created_at"
  FROM "password_reset_tokens"
  WHERE "used_at" IS NULL AND "expires_at" > now()
  ORDER BY "email", "created_at" DESC
) t
WHERE w."email" = t."email";--> statement-breakpoint
DROP TABLE IF EXISTS "password_history";--> statement-breakpoint
DROP TABLE IF EXISTS "password_reset_tokens";
