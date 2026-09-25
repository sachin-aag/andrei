import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import { groundTableOperation } from "@/lib/ai/chat/ground-draft";
import {
  descriptionSupportedNearKey,
  documentFamilyFromContext,
  documentFamilyFromFilename,
  extraQsrUnsupported,
  factSupportedForRowKey,
  isQsrRtmOptionalReferenceColumn,
  qsrFailClosedReason,
  quoteWindowAroundKey,
  rowKeyFromContext,
} from "@/lib/ai/chat/qsr-row-grounding";

const SHARED_URS_PAGE =
  "URS-5 Jacket temperature 20-25 °C for the jacket loop. URS-37 Process temperature 15–130 °C for the vessel. URS-44 Emergency Stop push button at each station.";

function ledgerFromPages(
  pages: Array<{
    filename: string;
    pageNumber: number;
    attachmentId: string;
    quote: string;
  }>
): CitationPageLedger {
  const ledger = new CitationPageLedger();
  for (const page of pages) {
    ledger.record(page.filename, page.pageNumber, page.attachmentId, {
      quote: page.quote,
    });
  }
  return ledger;
}

describe("quoteWindowAroundKey", () => {
  it("stops at the next URS ID so a same-page neighbour does not leak", () => {
    const urs5 = quoteWindowAroundKey(SHARED_URS_PAGE, "URS-5");
    const urs37 = quoteWindowAroundKey(SHARED_URS_PAGE, "URS-37");
    expect(urs5).toContain("20-25");
    expect(urs5).not.toContain("15–130");
    expect(urs37).toContain("15–130");
    expect(urs37).not.toContain("Emergency Stop");
  });

  it("does not look behind the last URS ID on a page", () => {
    const quote =
      "Vacuum gauge 0 to 760 mmHg. URS-36 Pressure Gauge for the shell.";
    expect(quoteWindowAroundKey(quote, "URS-36")).not.toContain("760");
    expect(quoteWindowAroundKey(quote, "URS-36")).toContain("Pressure Gauge");
  });
});

const COLUMN_URS_PAGE =
  "URS ID # Parameters User requirements URS-1 Reactor Capacity URS-2 MOC URS-3 Shell Operating temperature URS-4 Shell Operating pressure URS-12 Jacket MOC Format. No.:-QAD-SOP-FS-003-F03-00 8000 L High-quality Glass Lining and thickness should not be less than 1 mm 15 °C to 130 °C Full Vacuum to 3.5 Kg/cm²";

describe("quoteWindowAroundKey column-major URS pages", () => {
  it("does not give the last ID the requirement column", () => {
    expect(quoteWindowAroundKey(COLUMN_URS_PAGE, "URS-2")).toContain("MOC");
    expect(quoteWindowAroundKey(COLUMN_URS_PAGE, "URS-2")).not.toContain("1 mm");
    expect(quoteWindowAroundKey(COLUMN_URS_PAGE, "URS-12")).not.toContain("1 mm");
    expect(quoteWindowAroundKey(COLUMN_URS_PAGE, "URS-12")).not.toContain("8000");
    expect(quoteWindowAroundKey(SHARED_URS_PAGE, "URS-37")).toContain("15–130");
  });

  it("accepts 1 mm on URS-2 when that sentence follows the ID list", () => {
    const fact = extractHardFacts(
      "High-quality Glass Lining and thickness should not be less than 1 mm"
    ).find((row) => row.text.includes("1"));
    expect(fact).toBeTruthy();
    expect(factSupportedForRowKey(COLUMN_URS_PAGE, fact!, "URS-2")).toBe(true);
    expect(factSupportedForRowKey("URS-1 Reactor Capacity", fact!, "URS-2")).toBe(
      false
    );
    expect(
      descriptionSupportedNearKey(
        "High-quality Glass Lining and thickness should not be less than 1 mm",
        [COLUMN_URS_PAGE],
        "URS-2"
      )
    ).toBe(true);
  });

  it("does not treat URS-1 as a prefix of URS-13", () => {
    const page =
      "URS-13 Jacket Type URS-14 Baffle URS-20 Vapour Column MOC Limpet/Plain 01 No (Thermowell)";
    expect(quoteWindowAroundKey(page, "URS-1")).toBeNull();
    expect(quoteWindowAroundKey(page, "URS-13")).toContain("Jacket Type");
    expect(quoteWindowAroundKey(page, "URS-13")).not.toContain("Limpet");
    expect(quoteWindowAroundKey(page, "URS-20")).not.toContain("Limpet");
  });

  it("still rejects a range that sits inside a neighbour URS sentence", () => {
    const fact = extractHardFacts("15–130 °C").find((row) =>
      row.text.includes("130")
    );
    expect(fact).toBeTruthy();
    expect(factSupportedForRowKey(SHARED_URS_PAGE, fact!, "URS-5")).toBe(false);
    expect(factSupportedForRowKey(SHARED_URS_PAGE, fact!, "URS-37")).toBe(true);
  });
});

const LIVE_COLUMN_PAGES = [
  "URS-1 Reactor Capacity URS-2 MOC URS-3 Shell Operating temperature URS-7 Agitator URS-12 Jacket MOC 8000 L High-quality Glass Lining and thickness should not be less than 1 mm 15 °C to 130 °C Anchor-type agitator with suitable clearances for efficient mixing",
  "URS-13 Jacket Type URS-14 Baffle URS-20 Vapour Column MOC Limpet/Plain 01 No (Thermowell) Required PTFE-lined carbon steel URS-21 Sampling Point arrangement URS-25 Jacket Thickness URS-29 Jacket Dimension Required; to be provided in a safe, accessible, and representative location",
  "URS-58 View Glass Required URS-59 Light Glass URS-60 Nozzle URS-61 View Glass 14. OTHER Required Minimum 6 process/service nozzles required Required at product transfer line",
];

describe("column-major descriptions across pages", () => {
  it("keeps a requirement sentence when another row's parameter shares a word", () => {
    expect(
      descriptionSupportedNearKey(
        "High-quality Glass Lining and thickness should not be less than 1 mm",
        LIVE_COLUMN_PAGES,
        "URS-2"
      )
    ).toBe(true);
    expect(
      descriptionSupportedNearKey(
        "Anchor-type agitator with suitable clearances for efficient mixing",
        LIVE_COLUMN_PAGES,
        "URS-7"
      )
    ).toBe(true);
    expect(
      descriptionSupportedNearKey("Limpet/Plain", LIVE_COLUMN_PAGES, "URS-13")
    ).toBe(true);
    expect(
      descriptionSupportedNearKey("Required", LIVE_COLUMN_PAGES, "URS-59")
    ).toBe(true);
    expect(
      descriptionSupportedNearKey(
        "Minimum 6 process/service nozzles required",
        LIVE_COLUMN_PAGES,
        "URS-60"
      )
    ).toBe(true);
    expect(
      descriptionSupportedNearKey(
        "Required; to be provided in a safe, accessible, and representative location",
        LIVE_COLUMN_PAGES,
        "URS-21"
      )
    ).toBe(true);
  });

  it("proposes the column-major rows in one insert", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote: LIVE_COLUMN_PAGES[0]!,
      },
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 7,
        attachmentId: "urs",
        quote: LIVE_COLUMN_PAGES[1]!,
      },
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 11,
        attachmentId: "urs",
        quote: LIVE_COLUMN_PAGES[2]!,
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-2",
            "MOC",
            "High-quality Glass Lining and thickness should not be less than 1 mm [User Requirement Specification.PDF, p. 6]",
            "",
            "",
            "",
          ],
          ["URS-13", "Jacket Type", "Limpet/Plain [User Requirement Specification.PDF, p. 7]", "", "", ""],
          [
            "URS-59",
            "Light Glass",
            "Required [User Requirement Specification.PDF, p. 11]",
            "",
            "",
            "",
          ],
          [
            "URS-60",
            "Nozzle",
            "Minimum 6 process/service nozzles required [User Requirement Specification.PDF, p. 11]",
            "",
            "",
            "",
          ],
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(false);
    expect(result.unsupported).toEqual([]);
  });
});

describe("descriptionSupportedNearKey", () => {
  it("rejects Emergency Stop on URS-5 when that phrasing belongs to URS-44", () => {
    expect(
      descriptionSupportedNearKey("Emergency Stop push button", [SHARED_URS_PAGE], "URS-5")
    ).toBe(false);
    expect(
      descriptionSupportedNearKey("Emergency Stop push button", [SHARED_URS_PAGE], "URS-44")
    ).toBe(true);
  });

  it("treats a numeric URS-1 cell as supported without a same-page URS-N window", () => {
    expect(
      descriptionSupportedNearKey(
        "8000 L [User Requirement Specification.PDF, p. 1]",
        ["Equipment Name Glass Lined Reactor Capacity 8000 L"],
        "URS-1"
      )
    ).toBe(true);
  });

  it("accepts Reactor Capacity from the URS cover for URS-1", () => {
    expect(
      descriptionSupportedNearKey(
        "Reactor Capacity",
        ["Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301"],
        "URS-1"
      )
    ).toBe(true);
  });
});

describe("qsrRtmCellUnsupported / extraQsrUnsupported", () => {
  it("blocks stock Complies unless the named stage protocol passes that URS ID", () => {
    const emptyPass = ledgerFromPages([
      {
        filename: "IQ-GLR-1301.pdf",
        pageNumber: 12,
        attachmentId: "iq",
        quote: "URS-5 N/A for this protocol section.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "Complies",
        context: "URS-5\nIQ",
        section: "qsr_rtm_safety",
        ledger: emptyPass,
      }).map((fact) => fact.text)
    ).toContain("Complies");

    const passed = ledgerFromPages([
      {
        filename: "IQ-GLR-1301.pdf",
        pageNumber: 12,
        attachmentId: "iq",
        quote: "URS-5 Installation check meets acceptance. Result: complies.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "Complies",
        context: "URS-5\nIQ",
        section: "qsr_rtm_safety",
        ledger: passed,
      })
    ).toEqual([]);
  });

  it("blocks a stage cell when that protocol never names the row URS ID", () => {
    const ledger = ledgerFromPages([
      {
        filename: "OQ-GLR-1301.pdf",
        pageNumber: 4,
        attachmentId: "oq",
        quote: "Operational checks for agitator speed only.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "OQ",
        context: "URS-5",
        section: "qsr_rtm_process",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("OQ");
  });

  it("blocks VFD-compatible agitator text when the ledger already has an RPM", () => {
    const ledger = ledgerFromPages([
      {
        filename: "URS-GLR-1301.pdf",
        pageNumber: 3,
        attachmentId: "urs",
        quote: "Agitator speed 50 ± 10 RPM.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "VFD compatible",
        context: "Agitator RPM",
        section: "qsr_operating_range",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("VFD compatible");
  });

  it("does not extra-block a URS-1 capacity cell cited to the cover", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 1,
        attachmentId: "urs",
        quote:
          "Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "8000 L [User Requirement Specification.PDF, p. 1]",
        context: "URS-1\nReactor Capacity",
        section: "qsr_rtm_process",
        ledger,
      })
    ).toEqual([]);
  });
});

describe("qsrFailClosedReason", () => {
  it("fails closed on an RTM write when the URS is attached but unread", () => {
    const ledger = new CitationPageLedger();
    expect(
      qsrFailClosedReason({
        section: "qsr_rtm_safety",
        attachedFilenames: ["URS-GLR-1301.pdf"],
        ledger,
      })
    ).toMatch(/URS is attached/);
  });

  it("does not fail closed on an investigation table", () => {
    expect(
      qsrFailClosedReason({
        section: "define",
        attachedFilenames: ["URS-GLR-1301.pdf"],
        ledger: new CitationPageLedger(),
      })
    ).toBeNull();
  });
});

describe("row helpers", () => {
  it("reads the first URS-N as the row key", () => {
    expect(rowKeyFromContext("URS-44 Emergency Stop")).toBe("URS-44");
  });

  it("maps Qual Docs row labels to a document family", () => {
    expect(documentFamilyFromContext("URS User Requirement Specification")).toBe(
      "urs"
    );
    expect(documentFamilyFromContext("Design Qualification protocol")).toBe("dq");
  });

  it("maps the live GLR-1301 protocol filenames to a family", () => {
    expect(documentFamilyFromFilename("Design Qualification.PDF")).toBe("dq");
    expect(documentFamilyFromFilename("Installation Qualification.PDF")).toBe(
      "iq"
    );
    expect(documentFamilyFromFilename("Operational Qualification.PDF")).toBe(
      "oq"
    );
    expect(documentFamilyFromFilename("Performance Qualification.PDF")).toBe(
      "pq"
    );
    expect(
      documentFamilyFromFilename("User Requirement Specification.PDF")
    ).toBe("urs");
  });

  it("treats RTM Stage / Section / Remarks as optional reference columns", () => {
    expect(isQsrRtmOptionalReferenceColumn("qsr_rtm_process", 3)).toBe(true);
    expect(isQsrRtmOptionalReferenceColumn("qsr_rtm_process", 4)).toBe(true);
    expect(isQsrRtmOptionalReferenceColumn("qsr_rtm_process", 5)).toBe(true);
    expect(isQsrRtmOptionalReferenceColumn("qsr_rtm_process", 2)).toBe(false);
    expect(isQsrRtmOptionalReferenceColumn("qsr_rtm_control", 4)).toBe(true);
    expect(isQsrRtmOptionalReferenceColumn("qsr_rtm_control", 3)).toBe(false);
    expect(isQsrRtmOptionalReferenceColumn("qsr_operating_range", 3)).toBe(
      false
    );
  });

  it("still extracts a temperature that lives only in a neighbour window", () => {
    const facts = extractHardFacts(SHARED_URS_PAGE);
    expect(facts.map((fact) => `${fact.kind}:${fact.text}`)).toEqual(
      expect.arrayContaining([
        "temperature:20-25 °C",
        "temperature:15–130 °C",
        "identifier:URS-5",
        "identifier:URS-37",
        "identifier:URS-44",
      ])
    );
  });
});

describe("groundTableOperation optional RTM columns", () => {
  it("clears stock Complies instead of blocking the URS copy", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
    ]);
    const blocked = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          ["URS-5", "Jacket temperature", "20-25 °C", "IQ", "Section 13", "Complies"],
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(blocked.blocked).toBe(true);

    const cleared = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          ["URS-5", "Jacket temperature", "20-25 °C", "IQ", "Section 13", "Complies"],
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(cleared.blocked).toBe(false);
    const clearedRow =
      cleared.operation.kind === "insert_rows"
        ? cleared.operation.rows[0]!
        : [];
    expect(clearedRow[0]).toContain("URS-5");
    expect(clearedRow[1]).toBe("Jacket temperature");
    expect(clearedRow[2]).toContain("20-25 °C");
    expect(clearedRow.slice(3)).toEqual(["", "", ""]);
  });

  it("keeps IQ / Complies when Installation Qualification names that URS ID", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 12,
        attachmentId: "iq",
        quote:
          "URS-5 Installation check meets acceptance. Section 8.1. Result: complies.",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          ["URS-5", "Jacket temperature", "20-25 °C", "IQ", "8.1", "Complies"],
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    const keptRow =
      result.operation.kind === "insert_rows" ? result.operation.rows[0]! : [];
    expect(keptRow[0]).toContain("URS-5");
    expect(keptRow[1]).toBe("Jacket temperature");
    expect(keptRow[2]).toContain("20-25 °C");
    expect(keptRow[3]).toContain("IQ");
    expect(keptRow[4]).toContain("8.1");
    expect(keptRow[4]).not.toMatch(/Section 13/i);
    expect(keptRow[5]).toMatch(/Complies/i);
  });

  it("drops an edit_cells that only wrote unsupported Remarks", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 2, col: 5, insertText: "Complies", rowContext: "URS-5" }],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(true);
    expect(result.operation).toMatchObject({ kind: "edit_cells", cells: [] });
  });
});
