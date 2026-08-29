import { describe, expect, it, vi } from "vitest";
import { MANUAL_REVISION_IDLE_MS } from "@/lib/document-revisions/constants";
import {
  mergeAnalyticsSummary,
  planCoalescedRevision,
} from "@/lib/analytics-revisions/snapshot";

vi.mock("@/db", () => ({ db: {} }));

function latest(overrides: {
  source?: "agent_turn" | "manual";
  kind?: "worksheet" | "analysis";
  updatedAt?: Date;
  fingerprint?: string;
}) {
  return {
    id: "rev-1",
    source: overrides.source ?? "manual",
    kind: overrides.kind ?? "worksheet",
    updatedAt: overrides.updatedAt ?? new Date("2026-08-29T12:00:00.000Z"),
    fingerprint: overrides.fingerprint ?? "hash-a",
  };
}

describe("planCoalescedRevision", () => {
  const now = new Date("2026-08-29T12:00:10.000Z");

  it("inserts the first version", () => {
    expect(
      planCoalescedRevision({
        latest: null,
        nextFingerprint: "hash-a",
        nextKind: "worksheet",
        nextSource: "manual",
        now,
      })
    ).toEqual({ action: "insert" });
  });

  it("skips when the live analytics match the latest snapshot", () => {
    expect(
      planCoalescedRevision({
        latest: latest({ fingerprint: "hash-a" }),
        nextFingerprint: "hash-a",
        nextKind: "worksheet",
        nextSource: "manual",
        now,
      })
    ).toEqual({ action: "skip" });
  });

  it("replaces an open worksheet version inside the idle window", () => {
    expect(
      planCoalescedRevision({
        latest: latest({
          source: "agent_turn",
          kind: "worksheet",
          updatedAt: new Date("2026-08-29T12:00:00.000Z"),
          fingerprint: "hash-a",
        }),
        nextFingerprint: "hash-b",
        nextKind: "worksheet",
        nextSource: "agent_turn",
        now,
        idleMs: MANUAL_REVISION_IDLE_MS,
      })
    ).toEqual({ action: "replace", revisionId: "rev-1" });
  });

  it("inserts a plot version instead of rewriting a worksheet burst", () => {
    expect(
      planCoalescedRevision({
        latest: latest({ source: "agent_turn", kind: "worksheet" }),
        nextFingerprint: "hash-b",
        nextKind: "analysis",
        nextSource: "agent_turn",
        now,
      })
    ).toEqual({ action: "insert" });
  });

  it("does not rewrite a plot version during a worksheet burst", () => {
    expect(
      planCoalescedRevision({
        latest: latest({ source: "agent_turn", kind: "analysis" }),
        nextFingerprint: "hash-b",
        nextKind: "worksheet",
        nextSource: "agent_turn",
        now,
      })
    ).toEqual({ action: "insert" });
  });

  it("does not rewrite a manual row during an Agent burst", () => {
    expect(
      planCoalescedRevision({
        latest: latest({ source: "manual", kind: "worksheet" }),
        nextFingerprint: "hash-b",
        nextKind: "worksheet",
        nextSource: "agent_turn",
        now,
      })
    ).toEqual({ action: "insert" });
  });
});

describe("mergeAnalyticsSummary", () => {
  it("keeps a matching summary", () => {
    expect(mergeAnalyticsSummary("Edited worksheet", "Edited worksheet")).toBe(
      "Edited worksheet"
    );
  });

  it("collapses mixed edits in one burst", () => {
    expect(mergeAnalyticsSummary("Edited worksheet", "Created Assay")).toBe(
      "Edited analytics"
    );
  });
});
