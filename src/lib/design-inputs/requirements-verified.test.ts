import { describe, expect, it } from "vitest";
import { CONVERGENT_PROTOCOL_CONFIG } from "@/lib/customers/convergent/protocol-config";
import { buildLedger } from "./build-ledger";
import { EXPECTED } from "./expected-findings";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "./read-fixtures";
import { requirementsVerifiedRows } from "./requirements-verified";

describe("requirementsVerifiedRows", () => {
  const ledger = buildLedger(
    {
      srsText: readSrsFixture(),
      planText: readPlanFixture(),
      protocolText: readProtocolFixture(),
    },
    CONVERGENT_PROTOCOL_CONFIG
  );
  const rows = requirementsVerifiedRows(ledger);

  it("covers every live requirement and has no P/F field", () => {
    expect(rows).toHaveLength(EXPECTED.live);
    expect(rows[0]).not.toHaveProperty("passFail");
    expect(rows[0]).not.toHaveProperty("pf");
  });

  it("gives SW-IN-1.1 a single required-config set (fixture, not a criterion)", () => {
    const row = rows.find((r) => r.reqId === "SW-IN-1.1");
    expect(row).toBeDefined();
    expect(row!.requiredConfigs).toEqual(["TOP-00017 PCON"]);
  });
});
