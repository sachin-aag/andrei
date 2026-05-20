UPDATE "reports"
SET "deviation_no" = TRIM("deviation_no")
WHERE "deviation_no" <> TRIM("deviation_no");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_deviation_no_unique" ON "reports" ("deviation_no");
