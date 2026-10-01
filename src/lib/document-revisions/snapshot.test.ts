import { describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_REVISION_METADATA_SECTION,
  MANUAL_REVISION_IDLE_MS,
} from "@/lib/document-revisions/constants";
import {
  identityRevisionSnapshot,
  manualRevisionSummary,
  mergeManualSummary,
  planManualRevision,
  revisionFingerprint,
} from "@/lib/document-revisions/snapshot";
import { hashSectionContent } from "@/lib/audit";

vi.mock("@/db", () => ({ db: {} }));

function latest(overrides: {
  source?: "agent_turn" | "manual";
  updatedAt?: Date;
  fingerprint?: string;
}) {
  return {
    id: "rev-1",
    source: overrides.source ?? "manual",
    updatedAt: overrides.updatedAt ?? new Date("2026-08-29T12:00:00.000Z"),
    fingerprint: overrides.fingerprint ?? "define:aaa",
  };
}

describe("revisionFingerprint", () => {
  it("is order-independent", () => {
    expect(
      revisionFingerprint([
        { section: "measure", contentHash: "b" },
        { section: "define", contentHash: "a" },
      ])
    ).toBe(
      revisionFingerprint([
        { section: "define", contentHash: "a" },
        { section: "measure", contentHash: "b" },
      ])
    );
  });
});

describe("planManualRevision", () => {
  const now = new Date("2026-08-29T12:00:10.000Z");

  it("inserts the first version", () => {
    expect(
      planManualRevision({
        latest: null,
        nextFingerprint: "define:aaa",
        now,
      })
    ).toEqual({ action: "insert" });
  });

  it("skips when the live document matches the latest snapshot", () => {
    expect(
      planManualRevision({
        latest: latest({ fingerprint: "define:aaa" }),
        nextFingerprint: "define:aaa",
        now,
        idleMs: MANUAL_REVISION_IDLE_MS,
      })
    ).toEqual({ action: "skip" });
  });

  it("replaces an open manual version inside the idle window", () => {
    expect(
      planManualRevision({
        latest: latest({
          source: "manual",
          updatedAt: new Date("2026-08-29T12:00:00.000Z"),
          fingerprint: "define:aaa",
        }),
        nextFingerprint: "define:bbb",
        now,
        idleMs: MANUAL_REVISION_IDLE_MS,
      })
    ).toEqual({ action: "replace", revisionId: "rev-1" });
  });

  it("inserts a new version after the idle gap", () => {
    expect(
      planManualRevision({
        latest: latest({
          source: "manual",
          updatedAt: new Date("2026-08-29T11:59:00.000Z"),
          fingerprint: "define:aaa",
        }),
        nextFingerprint: "define:bbb",
        now,
        idleMs: MANUAL_REVISION_IDLE_MS,
      })
    ).toEqual({ action: "insert" });
  });

  it("inserts after an Agent version instead of rewriting it", () => {
    expect(
      planManualRevision({
        latest: latest({
          source: "agent_turn",
          updatedAt: new Date("2026-08-29T12:00:00.000Z"),
          fingerprint: "define:aaa",
        }),
        nextFingerprint: "define:bbb",
        now,
        idleMs: MANUAL_REVISION_IDLE_MS,
      })
    ).toEqual({ action: "insert" });
  });
});

describe("mergeManualSummary", () => {
  it("keeps a single-section summary", () => {
    expect(mergeManualSummary("Edited Define", "Edited Define")).toBe(
      "Edited Define"
    );
  });

  it("collapses mixed sections in one burst", () => {
    expect(mergeManualSummary("Edited Define", "Edited Measure")).toBe(
      "Edited document"
    );
  });
});

describe("identityRevisionSnapshot", () => {
  it("hashes a document-number-only change", () => {
    const before = identityRevisionSnapshot({
      metadata: { cycleNo: "01" },
      documentNo: "ELR-PR-001",
      date: "2026-04-01T00:00:00.000Z",
    });
    const after = identityRevisionSnapshot({
      metadata: { cycleNo: "01" },
      documentNo: "ELR-PR-00",
      date: "2026-04-01T00:00:00.000Z",
    });
    expect(hashSectionContent(before)).not.toBe(hashSectionContent(after));
    expect(after.documentNo).toBe("ELR-PR-00");
  });

  it("includes ISO dates so a header date delete is not skipped", () => {
    const fromDate = identityRevisionSnapshot({
      metadata: {},
      documentNo: "RA-1",
      date: new Date("2026-04-01T00:00:00.000Z"),
    });
    const toDate = identityRevisionSnapshot({
      metadata: {},
      documentNo: "RA-1",
      date: "2026-04-01T00:00:00.000Z",
    });
    expect(fromDate.date).toBe("2026-04-01T00:00:00.000Z");
    expect(hashSectionContent(fromDate)).toBe(hashSectionContent(toDate));
  });
});

describe("manualRevisionSummary", () => {
  it("names the workspace section", () => {
    expect(manualRevisionSummary("investigation_report", "define")).toBe(
      "Edited Define"
    );
  });

  it("labels cover-page / metadata edits", () => {
    expect(
      manualRevisionSummary(
        "investigation_report",
        DOCUMENT_REVISION_METADATA_SECTION
      )
    ).toBe("Updated document details");
  });
});
