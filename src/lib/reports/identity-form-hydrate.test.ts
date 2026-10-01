import { describe, expect, it } from "vitest";
import { decideIdentityHydrate } from "@/lib/reports/identity-form-hydrate";

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
