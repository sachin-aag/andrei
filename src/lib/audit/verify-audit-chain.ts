import crypto from "node:crypto";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export type AuditChainVerification = {
  valid: boolean;
  totalEvents: number;
  firstInvalidSeq: number | null;
  message: string;
};

export type AuditPayloadVersion = 1 | 2;

export type AuditCanonicalPayloadV1Input = {
  prevHash: string | null;
  actorId: string | null;
  action: string | null;
  entityType: string | null;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: Date | string | null;
};

export type AuditCanonicalPayloadV2Input = AuditCanonicalPayloadV1Input & {
  reportId: string | null;
  actorName: string | null;
  actorRole: string | null;
  summary: string | null;
  metadata: unknown;
};

function text(value: string | null | undefined): string {
  return value ?? "";
}

function timestampText(value: Date | string | null): string {
  if (value == null) return "";
  if (typeof value === "string") return value;

  const iso = value.toISOString();
  const [date, timeWithZone] = iso.split("T");
  const time = timeWithZone.replace("Z", "");
  const trimmed = time.endsWith(".000")
    ? time.slice(0, -4)
    : time.replace(/0+$/, "").replace(/\.$/, "");
  return `${date} ${trimmed}+00`;
}

function jsonbText(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jsonbText).join(", ")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}: ${jsonbText(record[key])}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value);
}

export function auditEventsCanonicalPayloadV1(
  input: AuditCanonicalPayloadV1Input
): string {
  return [
    text(input.prevHash),
    text(input.actorId),
    text(input.action),
    text(input.entityType),
    text(input.entityId),
    jsonbText(input.oldValue),
    jsonbText(input.newValue),
    timestampText(input.createdAt),
  ].join("|");
}

export function auditEventsCanonicalPayloadV2(
  input: AuditCanonicalPayloadV2Input
): string {
  return [
    text(input.prevHash),
    text(input.reportId),
    text(input.actorId),
    text(input.actorName),
    text(input.actorRole),
    text(input.action),
    text(input.entityType),
    text(input.entityId),
    text(input.summary),
    jsonbText(input.oldValue),
    jsonbText(input.newValue),
    jsonbText(input.metadata),
    timestampText(input.createdAt),
  ].join("|");
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function computeAuditEventHash(input: AuditCanonicalPayloadV2Input & {
  payloadVersion: AuditPayloadVersion;
}): string {
  switch (input.payloadVersion) {
    case 1:
      return sha256Hex(auditEventsCanonicalPayloadV1(input));
    case 2:
      return sha256Hex(auditEventsCanonicalPayloadV2(input));
    default: {
      const exhaustive: never = input.payloadVersion;
      return exhaustive;
    }
  }
}

function normalizePayloadVersion(version: number): AuditPayloadVersion | null {
  if (version === 1 || version === 2) return version;
  return null;
}

/** Verifies monotonic seq, prev_hash linkage, and hash payload recomputation. */
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

    const payloadVersion = normalizePayloadVersion(row.payloadVersion);
    if (!payloadVersion) {
      return {
        valid: false,
        totalEvents: rows.length,
        firstInvalidSeq: row.seq,
        message: `Unsupported audit payload version at seq ${row.seq}: ${row.payloadVersion}.`,
      };
    }

    const expectedHash = computeAuditEventHash({
      payloadVersion,
      prevHash: row.prevHash,
      reportId: row.reportId,
      actorId: row.actorId,
      actorName: row.actorName,
      actorRole: row.actorRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      oldValue: row.oldValue,
      newValue: row.newValue,
      metadata: row.metadata,
      createdAt: row.createdAt,
    });
    if (row.hash !== expectedHash) {
      return {
        valid: false,
        totalEvents: rows.length,
        firstInvalidSeq: row.seq,
        message: `Hash payload mismatch at seq ${row.seq}.`,
      };
    }

    expectedPrev = row.hash;
    expectedSeq += 1;
  }

  return {
    valid: true,
    totalEvents: rows.length,
    firstInvalidSeq: null,
    message: `Verified ${rows.length} audit events (seq + hash chain + payload hashes).`,
  };
}
