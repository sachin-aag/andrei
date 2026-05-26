DROP INDEX IF EXISTS "reports_deviation_no_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "reports_deviation_no_unique" ON "reports" ("author_id","deviation_no");
