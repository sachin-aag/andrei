import { describe, expect, it } from "vitest";
import {
  protocolModificationCountPhrase,
  snapshotAcceptedModifications,
} from "./protocol-modifications";
import type { ModificationRegisterContent } from "./types";

describe("protocol modifications snapshot", () => {
  it("keeps only accepted rows and computes the count phrase", () => {
    const register: ModificationRegisterContent = {
      rows: [
        {
          findingId: "c1",
          blockId: null,
          kind: "modified",
          target: "plan",
          before: "J5",
          after: "LCD-only code",
          rationale: "applicability",
          status: "accepted",
        },
        {
          findingId: "c2",
          blockId: null,
          kind: "modified",
          target: "plan",
          before: "J5",
          after: "CX-15",
          rationale: "applicability",
          status: "proposed",
        },
      ],
    };
    const snapshot = snapshotAcceptedModifications(
      "proto-1",
      register,
      "2026-08-16T00:00:00.000Z"
    );
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]?.findingId).toBe("c1");
    expect(protocolModificationCountPhrase(snapshot.rows.length)).toBe(
      "one (1)"
    );
  });
});
