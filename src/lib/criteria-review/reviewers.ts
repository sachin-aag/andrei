import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  humanReviewerSchema,
  type HumanReviewer,
} from "@/lib/criteria-review/human-judgment";
import { slugifyCriteriaReviewIdPart } from "@/lib/criteria-review/report-data";

function reviewerIdForEmail(email: string): string {
  return `reviewer-${slugifyCriteriaReviewIdPart(email)}`;
}

export async function listCriteriaReviewReviewers(): Promise<HumanReviewer[]> {
  const rows = await db.query.criteriaReviewReviewers.findMany({
    orderBy: [asc(schema.criteriaReviewReviewers.name)],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
  }));
}

export async function createCriteriaReviewReviewer(params: {
  name: string;
  email: string;
}): Promise<HumanReviewer> {
  const reviewer = humanReviewerSchema.parse({
    id: reviewerIdForEmail(params.email.trim().toLowerCase()),
    name: params.name.trim(),
    email: params.email.trim().toLowerCase(),
  });

  const existing = await db.query.criteriaReviewReviewers.findFirst({
    where: eq(schema.criteriaReviewReviewers.email, reviewer.email),
  });
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
    };
  }

  await db.insert(schema.criteriaReviewReviewers).values({
    id: reviewer.id,
    name: reviewer.name,
    email: reviewer.email,
  });

  return reviewer;
}
