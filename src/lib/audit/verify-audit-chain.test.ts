import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import {
  auditEventsCanonicalPayloadV1,
  auditEventsCanonicalPayloadV2,
  computeAuditEventHash,
  sha256Hex,
} from "./verify-audit-chain";

const createdAt = new Date("2026-01-01T00:00:00.000Z");

describe("audit hash canonical payload helpers", () => {
  it("computes v1 payload hashes using the original canonical fields", () => {
    const payload = auditEventsCanonicalPayloadV1({
      prevHash: "prev",
      actorId: "actor-1",
      action: "report_updated",
      entityType: "report",
      entityId: "report-1",
      oldValue: { status: "draft" },
      newValue: { status: "submitted" },
      createdAt,
    });

    expect(payload).toBe(
      'prev|actor-1|report_updated|report|report-1|{"status": "draft"}|{"status": "submitted"}|2026-01-01 00:00:00+00'
    );
    expect(
      computeAuditEventHash({
        payloadVersion: 1,
        prevHash: "prev",
        reportId: "ignored-in-v1",
        actorId: "actor-1",
        actorName: "Ignored",
        actorRole: "ignored",
        action: "report_updated",
        entityType: "report",
        entityId: "report-1",
        summary: "Ignored in v1",
        oldValue: { status: "draft" },
        newValue: { status: "submitted" },
        metadata: { ignored: true },
        createdAt,
      })
    ).toBe(sha256Hex(payload));
  });

  it("computes v2 payload hashes with report, actor, summary, and metadata", () => {
    const payload = auditEventsCanonicalPayloadV2({
      prevHash: "prev",
      reportId: "report-1",
      actorId: "actor-1",
      actorName: "Ada Lovelace",
      actorRole: "engineer",
      action: "report_submitted",
      entityType: "report",
      entityId: "report-1",
      summary: "Report status changed to submitted",
      oldValue: { status: "draft" },
      newValue: { status: "submitted" },
      metadata: { ip: "127.0.0.1" },
      createdAt,
    });

    expect(payload).toBe(
      'prev|report-1|actor-1|Ada Lovelace|engineer|report_submitted|report|report-1|Report status changed to submitted|{"status": "draft"}|{"status": "submitted"}|{"ip": "127.0.0.1"}|2026-01-01 00:00:00+00'
    );
    expect(
      computeAuditEventHash({
        payloadVersion: 2,
        prevHash: "prev",
        reportId: "report-1",
        actorId: "actor-1",
        actorName: "Ada Lovelace",
        actorRole: "engineer",
        action: "report_submitted",
        entityType: "report",
        entityId: "report-1",
        summary: "Report status changed to submitted",
        oldValue: { status: "draft" },
        newValue: { status: "submitted" },
        metadata: { ip: "127.0.0.1" },
        createdAt,
      })
    ).toBe(sha256Hex(payload));
  });
});

describe("canonical payload matches what Postgres hashed", () => {
  const base = {
    prevHash: "prev",
    reportId: "report-1",
    actorId: "actor-1",
    actorName: "Ada Lovelace",
    actorRole: "engineer",
    action: "evaluation_run",
    entityType: "evaluation",
    entityId: "report-1",
    summary: "AI evaluation run for define",
    oldValue: null,
    metadata: { reason: "manual" },
  };

  // Postgres stores jsonb keys sorted by length first, then bytewise — NOT
  // alphabetically. Sorting alphabetically here made every recomputed hash differ
  // from the one the insert trigger wrote.
  it("orders jsonb object keys by length, then bytewise", () => {
    const payload = auditEventsCanonicalPayloadV2({
      ...base,
      newValue: { evaluationCount: 6, sections: ["define"] },
      createdAt: "2026-09-03 10:08:26.623018+00",
    });

    expect(payload).toContain('{"sections": ["define"], "evaluationCount": 6}');
    expect(payload).not.toContain('{"evaluationCount": 6, "sections": ["define"]}');
  });

  it("orders equal-length jsonb keys bytewise", () => {
    const payload = auditEventsCanonicalPayloadV2({
      ...base,
      newValue: { bbb: 1, aaa: 2, ccc: 3 },
      createdAt: "2026-09-03 10:08:26.623018+00",
    });

    expect(payload).toContain('{"aaa": 2, "bbb": 1, "ccc": 3}');
  });

  // A JS Date only carries milliseconds; Postgres timestamptz carries microseconds.
  // verifyAuditChain() reads created_at::text so the extra digits survive.
  it("keeps microsecond precision when the timestamp arrives as text", () => {
    const payload = auditEventsCanonicalPayloadV2({
      ...base,
      newValue: { sections: ["define"] },
      createdAt: "2026-09-03 10:08:26.623018+00",
    });

    expect(payload.endsWith("|2026-09-03 10:08:26.623018+00")).toBe(true);
  });

  it("loses microseconds when the timestamp arrives as a Date", () => {
    const payload = auditEventsCanonicalPayloadV2({
      ...base,
      newValue: { sections: ["define"] },
      createdAt: new Date("2026-09-03T10:08:26.623Z"),
    });

    // Documents why the row must be read as text rather than coerced by the driver.
    expect(payload.endsWith("|2026-09-03 10:08:26.623+00")).toBe(true);
  });
});
