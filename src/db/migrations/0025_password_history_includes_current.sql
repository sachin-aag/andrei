UPDATE "workspace_users"
SET "password_history" = (
  CASE
    WHEN "password_hash" IS NULL THEN "password_history"
    WHEN cardinality("password_history") = 0
      OR "password_history"[1] IS DISTINCT FROM "password_hash"
    THEN (ARRAY["password_hash"] || "password_history")[1:3]
    ELSE "password_history"[1:3]
  END
)
WHERE "password_hash" IS NOT NULL;
