ALTER TABLE "review_findings" ALTER COLUMN "severity" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "public"."review_finding_severity" RENAME TO "review_finding_severity_old";
--> statement-breakpoint
CREATE TYPE "public"."review_finding_severity" AS ENUM('critical', 'major', 'minor');
--> statement-breakpoint
ALTER TABLE "review_findings" ALTER COLUMN "severity" TYPE "public"."review_finding_severity" USING (
  CASE "severity"::text
    WHEN 'error' THEN 'critical'
    WHEN 'warning' THEN 'major'
    ELSE 'minor'
  END
)::"public"."review_finding_severity";
--> statement-breakpoint
ALTER TABLE "review_findings" ALTER COLUMN "severity" SET DEFAULT 'major';
--> statement-breakpoint
DROP TYPE "public"."review_finding_severity_old";
