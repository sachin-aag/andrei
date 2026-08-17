import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONVERGENT_CHECK_POLICY,
  CONVERGENT_PROTOCOL_CONFIG,
} from "@/lib/customers/convergent/protocol-config";
import { buildLedger } from "./build-ledger";
import { runAllChecks } from "./checks";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "./read-fixtures";
import { proposeFix } from "./propose-fix";

describe("proposeFix", () => {
  const ledger = buildLedger({
    srsText: readSrsFixture(),
    planText: readPlanFixture(),
    protocolText: readProtocolFixture(),
  });
  const findings = runAllChecks(ledger, {
    policy: CONVERGENT_CHECK_POLICY,
    config: CONVERGENT_PROTOCOL_CONFIG,
  });

  it("does not bake product IDs into the proposer source", () => {
    const source = readFileSync(new URL("./propose-fix.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/SW-[A-Z]+-|\bJ[1-8]\b|Ophir/i);
  });

  it("proposes a plan alignment from the applicability quote (C1/C2 fixture)", () => {
    const c1 = findings.find(
      (f) => f.check === "applicability_vs_jcode" && f.reqIds.includes("SW-SIB-4")
    );
    const c2 = findings.find(
      (f) =>
        f.check === "applicability_vs_jcode" && f.reqIds.includes("SW-WLP-10.2")
    );
    expect(proposeFix(c1!, ledger)?.after).toMatch(/LCD/i);
    expect(proposeFix(c2!, ledger)?.after).toMatch(/CX-15|TOP-00051/i);
    expect(proposeFix(c1!, ledger)?.target).toBe("plan");
  });

  it("returns null for clean obsolete and confirmation findings", () => {
    const clean = findings.find(
      (f) =>
        f.check === "obsolete_still_present" && f.disposition === "clean"
    );
    const confirm = findings.find((f) => f.disposition === "needs_confirmation");
    expect(proposeFix(clean!, ledger)).toBeNull();
    expect(proposeFix(confirm!, ledger)).toBeNull();
  });
});
