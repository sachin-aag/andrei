import { describe, expect, it } from "vitest";
import { CONVERGENT_PROTOCOL_CONFIG } from "@/lib/customers/convergent/protocol-config";
import { repairWrappedIds, uniqueIds } from "./ids";
import { parseRequirements, liveRequirements } from "./parse-requirements";
import { readSrsFixture } from "./read-fixtures";
import { EXPECTED } from "./expected-findings";

const config = CONVERGENT_PROTOCOL_CONFIG;

describe("repairWrappedIds", () => {
  it("joins SW- / family wraps and SW-FAM- / number wraps", () => {
    const banner = [
      "SW-EL-1, SW-CL-1.5, SW-",
      "       CL-1.6, SW-CL-1.7",
      "SW-MHR-2.2.1, SW-",
      "     MHR-3",
      "SW-WLP-",
      "      24.1.3, SW-WLP-18",
    ].join("\n");
    const repaired = repairWrappedIds(banner);
    expect(repaired).toContain("SW-CL-1.6");
    expect(repaired).toContain("SW-MHR-3");
    expect(repaired).toContain("SW-WLP-24.1.3");
  });
});

describe("parseRequirements", () => {
  it("captures an ID that sits on its own line with text on the next", () => {
    const snippet = [
      "            SW-IN-1                   The software shall support upgrades via installation.",
      "            SW-IN-1.1",
      "                                      When performing an upgrade installation, the software under test shall",
      "                                      preserve changes made by users.",
      "            SW-IN-1.2                 The software shall support upgrades via installation while the system is in",
    ].join("\n");
    const parsed = parseRequirements(snippet, config);
    expect(parsed.map((r) => r.id)).toEqual(["SW-IN-1", "SW-IN-1.1", "SW-IN-1.2"]);
    expect(parsed[1]?.text).toMatch(/preserve changes made by users/);
  });

  it("parses the SRS fixture to the oracle counts", () => {
    const requirements = parseRequirements(readSrsFixture(), config);
    const live = liveRequirements(requirements);
    const removed = requirements.filter((r) => r.removedInRev !== null);
    const deferred = requirements.filter((r) => r.deferred);
    expect(requirements).toHaveLength(EXPECTED.parsedIds);
    expect(uniqueIds(requirements.map((r) => r.id))).toHaveLength(
      EXPECTED.parsedIds
    );
    expect(live).toHaveLength(EXPECTED.live);
    expect(removed).toHaveLength(EXPECTED.removed);
    expect(deferred.map((r) => r.id)).toEqual([...EXPECTED.deferredOk]);
    expect(requirements.some((r) => r.id === "SW-IN-1.1")).toBe(true);
  });
});
