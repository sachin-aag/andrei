import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";

export async function listCriteriaReviewReviewers(): Promise<HumanReviewer[]> {
  const rows = await db.query.workspaceUsers.findMany({
    orderBy: [asc(schema.workspaceUsers.name)],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
  }));
}
