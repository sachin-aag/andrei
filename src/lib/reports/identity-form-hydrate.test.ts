import { describe, expect, it } from "vitest";
import {
  decideIdentityHydrate,
  shouldMarkIdentityHydratePersisted,
} from "@/lib/reports/identity-form-hydrate";

describe("decideIdentityHydrate", () => {
  it("skips when the report snapshot already matches the inputs", () => {
    expect(
      decideIdentityHydrate({
        incomingSerialized: '{"cycleNo":"01"}',
        localSerialized: '{"cycleNo":"01"}',
        lastPersistedSerialized: '{"cycleNo":"01"}',
      })
    ).toBe("skip");
  });

  it("restores local keystrokes instead of a stale GET while dirty", () => {
    expect(
      decideIdentityHydrate({
        incomingSerialized: '{"cycleNo":""}',
        localSerialized: '{"cycleNo":"01"}',
        lastPersistedSerialized: '{"cycleNo":""}',
      })
    ).toBe("restore");
  });

  it("hydrates an Apply / refresh that lands after the form is clean", () => {
    expect(
      decideIdentityHydrate({
        incomingSerialized: '{"cycleNo":"02"}',
        localSerialized: '{"cycleNo":""}',
        lastPersistedSerialized: '{"cycleNo":""}',
      })
    ).toBe("hydrate");
  });

  it("restores when a late GET is older than the last persist", () => {
    expect(
      decideIdentityHydrate({
        incomingSerialized: '{"cycleNo":""}',
        localSerialized: '{"cycleNo":"01"}',
        lastPersistedSerialized: '{"cycleNo":"01"}',
        incomingUpdatedAt: "2026-10-01T15:00:00.000Z",
        lastSeenUpdatedAt: "2026-10-01T15:00:01.000Z",
      })
    ).toBe("restore");
  });
});

describe("shouldMarkIdentityHydratePersisted", () => {
  it("marks persisted when the incoming clock is newer than last seen", () => {
    expect(
      shouldMarkIdentityHydratePersisted({
        incomingUpdatedAt: "2026-10-01T15:00:02.000Z",
        lastSeenUpdatedAt: "2026-10-01T15:00:00.000Z",
      })
    ).toBe(true);
  });

  it("does not mark persisted on the same clock as a keystroke setReport", () => {
    expect(
      shouldMarkIdentityHydratePersisted({
        incomingUpdatedAt: "2026-10-01T15:00:02.000Z",
        lastSeenUpdatedAt: "2026-10-01T15:00:02.000Z",
      })
    ).toBe(false);
  });

  it("does not mark persisted when the incoming snapshot has no clock", () => {
    expect(
      shouldMarkIdentityHydratePersisted({
        incomingUpdatedAt: null,
        lastSeenUpdatedAt: "2026-10-01T15:00:00.000Z",
      })
    ).toBe(false);
  });

  it("marks persisted when this is the first clock we have seen", () => {
    expect(
      shouldMarkIdentityHydratePersisted({
        incomingUpdatedAt: "2026-10-01T15:00:00.000Z",
        lastSeenUpdatedAt: null,
      })
    ).toBe(true);
  });
});
