import { describe, expect, it } from "vitest";
import { WORKSPACE_USERS_BASELINE_SQL } from "./workspace-users-baseline";

describe("WORKSPACE_USERS_BASELINE_SQL", () => {
  it("creates the 0014-era workspace_users table so fresh migrate can drop employee_id", () => {
    expect(WORKSPACE_USERS_BASELINE_SQL).toContain(
      'CREATE TYPE "public"."user_role"'
    );
    expect(WORKSPACE_USERS_BASELINE_SQL).toContain(
      'CREATE TABLE IF NOT EXISTS "workspace_users"'
    );
    expect(WORKSPACE_USERS_BASELINE_SQL).toContain('"employee_id" text');
    expect(WORKSPACE_USERS_BASELINE_SQL).toContain(
      '"workspace_users_employee_id_unique"'
    );
  });
});
