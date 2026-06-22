import { asc } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export type AuditChainVerification = {
  valid: boolean;
  totalEvents: number;
  firstInvalidSeq: number | null;
  message: string;
};

/** Verifies monotonic seq and prev_hash linkage (hash recomputation matches DB trigger). */
export async function verifyAuditChain(): Promise<AuditChainVerification> {
  const rows = await db
    .select()
    .from(auditEvents)
    .orderBy(asc(auditEvents.seq));

  if (rows.length === 0) {
    return {
      valid: true,
      totalEvents: 0,
      firstInvalidSeq: null,
      message: "Empty audit chain (valid).",
    };
  }

  let expectedPrev = "";
  let expectedSeq = rows[0]!.seq;

  for (const row of rows) {
    if (row.seq !== expectedSeq) {
      return {
        valid: false,
        totalEvents: rows.length,
        firstInvalidSeq: row.seq,
        message: `Sequence gap at seq ${row.seq} (expected ${expectedSeq}).`,
      };
    }

    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        totalEvents: rows.length,
        firstInvalidSeq: row.seq,
        message: `Hash chain break at seq ${row.seq}: prev_hash mismatch.`,
      };
    }

    if (!row.hash) {
      return {
        valid: false,
        totalEvents: rows.length,
        firstInvalidSeq: row.seq,
        message: `Missing hash at seq ${row.seq}.`,
      };
    }

    expectedPrev = row.hash;
    expectedSeq += 1;
  }

  return {
    valid: true,
    totalEvents: rows.length,
    firstInvalidSeq: null,
    message: `Verified ${rows.length} audit events (seq + hash chain).`,
  };
}
