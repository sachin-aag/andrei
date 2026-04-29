import "dotenv/config";
import { db } from "@/db";
import { comments, criteriaEvaluations } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const reportId = "c7qodra4vhxqdbcdryq59jc7";
  
  const evals = await db.select().from(criteriaEvaluations).where(eq(criteriaEvaluations.reportId, reportId));
  const byId = new Map(evals.map(e => [e.id, e]));

  const cms = await db.select().from(comments).where(eq(comments.reportId, reportId));
  for (const c of cms.filter(c => c.section === "define" && c.kind === "ai_fix")) {
    const e = c.evaluationId ? byId.get(c.evaluationId) : null;
    console.log(`Comment ${c.id}: status=${c.status} criterion=${e?.criterionKey} eval_status=${e?.status} from=${c.fromPos} to=${c.toPos}`);
  }
}
main().catch(console.error);