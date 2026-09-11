import { describe, expect, it } from "vitest";
import {
  isStaleIngest,
  lastActivityForStaleReclaim,
  STALE_INGEST_MS,
} from "./stale-ingest-policy";

const now = new Date("2026-08-10T12:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

describe("isStaleIngest", () => {
  it("reclaims an ingest whose last activity predates the window", () => {
    expect(
      isStaleIngest(
        { processingStatus: "processing", lastActivityAt: minutesAgo(45) },
        now
      )
    ).toBe(true);
  });

  it("leaves an ingest that is still inside the window", () => {
    expect(
      isStaleIngest(
        { processingStatus: "processing", lastActivityAt: minutesAgo(5) },
        now
      )
    ).toBe(false);
  });

  it("leaves terminal attachments alone", () => {
    for (const processingStatus of ["ready", "failed"] as const) {
      expect(
        isStaleIngest({ processingStatus, lastActivityAt: minutesAgo(600) }, now)
      ).toBe(false);
    }
  });

  it("leaves in-flight uploads alone, since no ingest has started", () => {
    expect(
      isStaleIngest(
        { processingStatus: "uploading", lastActivityAt: minutesAgo(600) },
        now
      )
    ).toBe(false);
  });

  it("reclaims queued and validating attachments", () => {
    for (const processingStatus of ["queued", "validating"] as const) {
      expect(
        isStaleIngest({ processingStatus, lastActivityAt: minutesAgo(600) }, now)
      ).toBe(true);
    }
  });

  it("keeps an attachment with no recorded activity", () => {
    expect(
      isStaleIngest({ processingStatus: "processing", lastActivityAt: null }, now)
    ).toBe(false);
  });

  it("does not treat an old upload time as ingest activity", () => {
    expect(lastActivityForStaleReclaim(null)).toBeNull();
    expect(
      isStaleIngest(
        {
          processingStatus: "queued",
          lastActivityAt: lastActivityForStaleReclaim(null),
        },
        now
      )
    ).toBe(false);
  });

  it("still reclaims a report-native upload with no run after the window", () => {
    expect(
      isStaleIngest(
        { processingStatus: "queued", lastActivityAt: minutesAgo(45) },
        now
      )
    ).toBe(true);
  });

  it("honours a caller-supplied window", () => {
    const lastActivityAt = new Date(now.getTime() - STALE_INGEST_MS / 2);
    expect(
      isStaleIngest({ processingStatus: "processing", lastActivityAt }, now)
    ).toBe(false);
    expect(
      isStaleIngest(
        { processingStatus: "processing", lastActivityAt },
        now,
        STALE_INGEST_MS / 4
      )
    ).toBe(true);
  });
});
