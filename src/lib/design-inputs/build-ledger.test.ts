import { describe, expect, it } from "vitest";
import { buildLedger } from "./build-ledger";
import { liveRequirements } from "./parse-requirements";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "./read-fixtures";
import { EXPECTED } from "./expected-findings";

describe("buildLedger", () => {
  it("matches oracle counts against the three fixtures", () => {
    const ledger = buildLedger({
      srsText: readSrsFixture(),
      planText: readPlanFixture(),
      protocolText: readProtocolFixture(),
    });
    expect(ledger.requirements).toHaveLength(EXPECTED.parsedIds);
    expect(liveRequirements(ledger.requirements)).toHaveLength(EXPECTED.live);
    expect(
      ledger.requirements.filter((r) => r.removedInRev !== null)
    ).toHaveLength(EXPECTED.removed);
    expect(ledger.blocks).toHaveLength(EXPECTED.blockCount);
  });
});
