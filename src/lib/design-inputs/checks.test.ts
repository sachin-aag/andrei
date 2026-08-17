import { describe, expect, it } from "vitest";
import {
  CONVERGENT_CHECK_POLICY,
  CONVERGENT_PROTOCOL_CONFIG,
} from "@/lib/customers/convergent/protocol-config";
import { buildLedger } from "./build-ledger";
import { runAllChecks } from "./checks";
import { EXPECTED } from "./expected-findings";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "./read-fixtures";

import type { Finding } from "./types";

function reqIds(findings: Finding[], check: string): string[] {
  return findings
    .filter((f) => f.check === check)
    .flatMap((f) => f.reqIds)
    .sort();
}

describe("runAllChecks", () => {
  const ledger = buildLedger({
    srsText: readSrsFixture(),
    planText: readPlanFixture(),
    protocolText: readProtocolFixture(),
  });
  const findings = runAllChecks(ledger, {
    policy: CONVERGENT_CHECK_POLICY,
    config: CONVERGENT_PROTOCOL_CONFIG,
  });

  it("matches the Solea oracle for coverage and ID checks", () => {
    expect(reqIds(findings, "declared_but_untested")).toEqual(
      [...EXPECTED.declaredButUntested].sort()
    );
    expect(reqIds(findings, "live_untested")).toEqual(
      [...EXPECTED.absentFromProtocol].sort()
    );
    expect(reqIds(findings, "dangling_id")).toEqual(
      EXPECTED.dangling.map((d) => d.id).sort()
    );
    expect(
      findings.filter(
        (f) =>
          f.check === "obsolete_still_present" && f.disposition === "defect"
      )
    ).toHaveLength(EXPECTED.obsoleteStillPresent);
    expect(
      findings.some(
        (f) =>
          f.check === "obsolete_still_present" && f.disposition === "clean"
      )
    ).toBe(true);
  });

  it("applies overlay dispositions without baking IDs into the check bodies", () => {
    const byReq = Object.fromEntries(
      findings
        .filter((f) => f.check === "applicability_vs_jcode")
        .map((f) => [f.reqIds[0], f.disposition])
    );
    expect(byReq["SW-SIB-4"]).toBe("defect");
    expect(byReq["SW-WLP-10.2"]).toBe("defect");
    expect(byReq["SW-LWB-4"]).toBe("needs_confirmation");
    expect(reqIds(findings, "one_jcode_per_req")).toEqual(["SW-SIB-3"]);
  });

  it("flags Ophir as an equipment gap", () => {
    const equipment = findings.filter((f) => f.check === "equipment_gap");
    expect(
      equipment.some((f) => /ophir/i.test(f.evidence[0]?.quote ?? ""))
    ).toBe(EXPECTED.ophirMissingFromTable2);
  });

  it("queues tilde, non-normative, banner dupes, and N=1 for review", () => {
    expect(findings.some((f) => f.check === "tilde_tolerance")).toBe(true);
    expect(findings.some((f) => f.check === "non_normative")).toBe(true);
    expect(findings.some((f) => f.check === "banner_dupes")).toBe(true);
    expect(findings.some((f) => f.check === "datasheet_n1")).toBe(true);
  });
});
