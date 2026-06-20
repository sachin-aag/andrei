ALTER TABLE "password_policy_settings" DROP COLUMN IF EXISTS "min_length";--> statement-breakpoint
ALTER TABLE "password_policy_settings" DROP COLUMN IF EXISTS "require_letter";--> statement-breakpoint
ALTER TABLE "password_policy_settings" DROP COLUMN IF EXISTS "require_number";--> statement-breakpoint
ALTER TABLE "password_policy_settings" DROP COLUMN IF EXISTS "require_special";
