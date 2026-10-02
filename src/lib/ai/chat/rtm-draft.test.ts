import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { leftoverMissingUrsIds } from "./rtm-draft";
import type { TableOperation } from "@/lib/suggestions/table-operation";

const URS = "User Requirement Specification.PDF";

function ledger(): CitationPageLedger {
  const pages = new CitationPageLedger();
  pages.record(URS, 6, "att-urs", {
    quote:
      "Process Requirements URS-2 MOC Glass lining URS-3 Capacity 8000 L URS-4 Pressure Full Vacuum",
  });
  return pages;
}

describe("leftoverMissingUrsIds", () => {
  it("does not re-list IDs the insert landed after a follow-up edit_cells", () => {
    const insert: TableOperation = {
      kind: "insert_rows",
      tableIndex: 0,
      rows: [
        ["URS-2", "MOC", "Glass lining"],
        ["URS-3", "Capacity", "8000 L"],
        ["URS-4", "Pressure", "Full Vacuum"],
      ],
    };
    const edit: TableOperation = {
      kind: "edit_cells",
      tableIndex: 0,
      cells: [{ row: 1, col: 1, rowKey: "URS-1", insertText: "Reactor Capacity" }],
    };
    expect(
      leftoverMissingUrsIds({
        operations: [insert, edit],
        ledger: ledger(),
        section: "qsr_rtm_process",
        fieldDoc: null,
      })
    ).toEqual([]);
  });

  it("keeps IDs that neither operation included", () => {
    const insert: TableOperation = {
      kind: "insert_rows",
      tableIndex: 0,
      rows: [["URS-2", "MOC", "Glass lining"]],
    };
    expect(
      leftoverMissingUrsIds({
        operations: [insert],
        ledger: ledger(),
        section: "qsr_rtm_process",
        fieldDoc: null,
      })
    ).toEqual(["URS-3", "URS-4"]);
  });
});
