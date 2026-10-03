import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { groundTableOperation } from "@/lib/ai/chat/ground-draft";
import { composeRtmOperations, identityOnlyOperation } from "./rtm-compose";
import type { RtmIdentityRow } from "./rtm-identity";

const URS = "User Requirement Specification.PDF";

function ledgerFor(quote: string): CitationPageLedger {
  const ledger = new CitationPageLedger();
  ledger.record(URS, 4, "att-urs", { quote });
  return ledger;
}

const IDENTITY: RtmIdentityRow[] = [
  {
    ursId: "URS-2",
    parameters: "MOC",
    userRequirement: "Glass lining",
    citation: `[${URS}, p. 4]`,
  },
  {
    ursId: "URS-3",
    parameters: "Capacity",
    userRequirement: "8000 L",
    citation: `[${URS}, p. 4]`,
  },
];

describe("composeRtmOperations", () => {
  it("inserts new URS IDs and edits live ones", () => {
    const composed = composeRtmOperations({
      section: "qsr_rtm_process",
      fieldDoc: null,
      identityRows: IDENTITY,
      familyCells: [
        {
          family: "iq",
          cells: [
            {
              ursId: "URS-3",
              text: "13.3 – Capacity check",
              citation: "[Installation Qualification.PDF, p. 13]",
            },
          ],
        },
      ],
      insertUrsIds: ["URS-2", "URS-3"],
      editUrsIds: [],
    });
    expect(composed.insertRows?.kind).toBe("insert_rows");
    const rows =
      composed.insertRows?.kind === "insert_rows"
        ? composed.insertRows.rows
        : [];
    expect(rows.map((row) => row[0])).toEqual(["URS-2", "URS-3"]);
    expect(rows[0]?.[1]).toBe("MOC");
    expect(rows[1]?.[4]).toContain("13.3");
    expect(composed.editCells).toBeNull();
  });

  it("edits family columns of live URS rows", () => {
    const composed = composeRtmOperations({
      section: "qsr_rtm_process",
      fieldDoc: null,
      identityRows: [],
      familyCells: [
        {
          family: "dq",
          cells: [{ ursId: "URS-1", text: "5.1 – Capacity", citation: "[DQ.pdf, p. 2]" }],
        },
      ],
      insertUrsIds: [],
      editUrsIds: ["URS-1"],
    });
    expect(composed.insertRows).toBeNull();
    expect(composed.editCells?.kind).toBe("edit_cells");
    const cells =
      composed.editCells?.kind === "edit_cells" ? composed.editCells.cells : [];
    expect(cells.some((cell) => cell.col === 3 && cell.rowKey === "URS-1")).toBe(
      true
    );
  });
});

describe("identity-first grounding", () => {
  it("keeps the URS row when a family cell is unsupported", () => {
    const quote =
      "Process Requirements URS-2 MOC Glass lining URS-3 Capacity 8000 L";
    const ledger = ledgerFor(quote);
    const composed = composeRtmOperations({
      section: "qsr_rtm_process",
      fieldDoc: null,
      identityRows: IDENTITY,
      familyCells: [
        {
          family: "dq",
          cells: [
            {
              ursId: "URS-2",
              text: "Cover page 01-Apr-2099",
              citation: "[Design Qualification.PDF, p. 1]",
            },
          ],
        },
      ],
      insertUrsIds: ["URS-2"],
      editUrsIds: [],
    });
    expect(composed.insertRows).not.toBeNull();
    const identityOp = identityOnlyOperation(
      composed.insertRows!,
      "qsr_rtm_process"
    );
    const identityGround = groundTableOperation({
      operation: identityOp,
      ledger,
      policy: "block",
      grounding: {
        mode: "strict",
        section: "qsr_rtm_process",
        attachedFilenames: [URS],
      },
    });
    expect(identityGround.blocked).toBe(false);
    const merged = groundTableOperation({
      operation: composed.insertRows!,
      ledger,
      policy: "block",
      clearOptionalOnBlock: true,
      grounding: {
        mode: "strict",
        section: "qsr_rtm_process",
        attachedFilenames: [URS, "Design Qualification.PDF"],
      },
    });
    expect(merged.blocked).toBe(false);
    const rows =
      merged.operation.kind === "insert_rows" ? merged.operation.rows : [];
    expect(rows[0]?.[0]).toBe("URS-2");
    expect(rows[0]?.[3]?.replace(/\[[^\]]*\]/g, "").trim()).toBe("");
  });

  it("blocks when the URS identity cell is unsupported", () => {
    const ledger = ledgerFor("Process Requirements URS-2 MOC Glass lining");
    const composed = composeRtmOperations({
      section: "qsr_rtm_process",
      fieldDoc: null,
      identityRows: [
        {
          ursId: "URS-2",
          parameters: "Invented parameter 99.9",
          userRequirement: "Not on the page 12.34",
          citation: `[${URS}, p. 4]`,
        },
      ],
      familyCells: [],
      insertUrsIds: ["URS-2"],
      editUrsIds: [],
    });
    const identityOp = identityOnlyOperation(
      composed.insertRows!,
      "qsr_rtm_process"
    );
    const identityGround = groundTableOperation({
      operation: identityOp,
      ledger,
      policy: "block",
      grounding: {
        mode: "strict",
        section: "qsr_rtm_process",
        attachedFilenames: [URS],
      },
    });
    expect(identityGround.blocked).toBe(true);
  });
});
