import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  humanReviewerSchema,
  type HumanReviewer,
} from "@/lib/criteria-review/human-judgment";
import { slugifyCriteriaReviewIdPart } from "@/lib/criteria-review/report-data";

function reviewerIdForEmployee(employeeId: string): string {
  return `reviewer-${slugifyCriteriaReviewIdPart(employeeId)}`;
}

export async function listCriteriaReviewReviewers(): Promise<HumanReviewer[]> {
  const rows = await db.query.criteriaReviewReviewers.findMany({
    orderBy: [asc(schema.criteriaReviewReviewers.name)],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    employeeId: row.employeeId,
  }));
}

export async function createCriteriaReviewReviewer(params: {
  name: string;
  employeeId: string;
}): Promise<HumanReviewer> {
  const reviewer = humanReviewerSchema.parse({
    id: reviewerIdForEmployee(params.employeeId),
    name: params.name,
    employeeId: params.employeeId,
  });

  const existing = await db.query.criteriaReviewReviewers.findFirst({
    where: eq(schema.criteriaReviewReviewers.employeeId, reviewer.employeeId),
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      employeeId: existing.employeeId,
    };
  }

  await db.insert(schema.criteriaReviewReviewers).values({
    id: reviewer.id,
    name: reviewer.name,
    employeeId: reviewer.employeeId,
  });

  return reviewer;
}
