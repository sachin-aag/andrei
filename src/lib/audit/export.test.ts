import { describe, expect, it } from "vitest";
import { auditEventsToCsv } from "./audit-csv";
import type { auditEvents } from "@/db/schema";

type AuditRow = typeof auditEvents.$inferSelect;

function makeAuditRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: "audit-1",
    seq: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    actorId: "user-1",
    actorName: "Engineer",
    actorRole: "engineer",
    action: "comment_created",
    entityType: "comment",
    entityId: "comment-1",
    reportId: "report-1",
    summary: "Comment created in define",
    oldValue: null,
    newValue: { content: "benign text" },
    hash: "abc123",
    prevHash: "000000",
    metadata: {},
    ...overrides,
  };
}

describe("auditEventsToCsv", () => {
  it("neutralizes spreadsheet formula prefixes in exported cells", () => {
    const csv = auditEventsToCsv([
      makeAuditRow({
        actorName: '=HYPERLINK("http://evil.example","click")',
        summary: '=1+1',
        newValue: { content: '=cmd|\'/C calc\'!A0' },
      }),
    ]);

    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain('"\'=HYPERLINK(""http://evil.example"",""click"")"');
    expect(dataLine).toContain("'=1+1");
    expect(dataLine).toContain('"{""content"":""=cmd|\'/C calc\'!A0""}"');
  });

  it("still quotes values containing commas and escapes embedded quotes", () => {
    const csv = auditEventsToCsv([
      makeAuditRow({
        summary: 'note, with "quotes"',
      }),
    ]);

    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain('"note, with ""quotes"""');
  });
});
