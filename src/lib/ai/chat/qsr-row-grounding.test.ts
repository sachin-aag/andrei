import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import {
  groundTableOperation,
  tablePlaceholderLabels,
} from "@/lib/ai/chat/ground-draft";
import { QSR_RTM_HEADERS } from "@/lib/document-types/qsr/sections";
import { buildTableOperationPreviewDoc } from "@/lib/suggestions/table-preview";
import { suggestionInsertMarkName } from "@/lib/tiptap/suggestion-marks";
import {
  dateSupportedAsLabeledField,
  descriptionSupportedNearKey,
  protocolBodyQuote,
  documentFamilyFromContext,
  documentFamilyFromFilename,
  extraQsrUnsupported,
  factSupportedForRowKey,
  isQsrRtmOptionalReferenceColumn,
  pickRtmReference,
  qsrFailClosedReason,
  qsrRtmCellUnsupported,
  qsrTableColumnLabel,
  quoteWindowAroundKey,
  pageLevelTokenAroundKey,
  rowKeyFromContext,
  rtmReferenceColumnIndexes,
  dropQsrRtmPlaceholderCells,
  shouldKeepRtmProtocolSearchOpen,
} from "@/lib/ai/chat/qsr-row-grounding";

/** Synthetic neighbour-window page. Live GLR-1301 URS-37 is −20 °C to 150 °C. */
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

describe("pageLevelTokenAroundKey", () => {
  it("includes a pass token after the next URS ID on the same page", () => {
    const quote =
      "URS-40 URS-41 URS-42 13.6 Gaskets PTFE or equivalent Result: Verified";
    expect(quoteWindowAroundKey(quote, "URS-41")).not.toMatch(/Verified/i);
    expect(pageLevelTokenAroundKey(quote, "URS-41")).toMatch(/Verified/i);
    expect(pageLevelTokenAroundKey(quote, "URS-41")).not.toContain("760");
  });

  it("does not steal a neighbour number from an earlier URS window", () => {
    const quote =
      "Vacuum gauge 0 to 760 mmHg. URS-36 Pressure Gauge for the shell.";
    expect(pageLevelTokenAroundKey(quote, "URS-36")).not.toContain("760");
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

  it("finds URS-33 when OCR wraps the ID into the page footer", () => {
    const page =
      "URS ID # Parameters User requirements URS-30 Batch Size URS-31 Type of Operation URS-32 Location URS- 33 Stage and location Format. No.:-QAD-SOP-FS-003-F03-00 Page 8 of 12 Equipment intended for intermediate stage manufacturing operations.";
    expect(quoteWindowAroundKey(page, "URS-33")).not.toBeNull();
    expect(
      descriptionSupportedNearKey("Stage and location", [page], "URS-33")
    ).toBe(true);
    expect(
      descriptionSupportedNearKey(
        "Equipment intended for intermediate stage manufacturing operations.",
        [page],
        "URS-33"
      )
    ).toBe(true);
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

  it("proposes URS-33 from a column-major page whose ID wraps at the footer", () => {
    const page =
      "URS ID # Parameters User requirements URS-30 Batch Size URS-31 Type of Operation URS-32 Location URS- 33 Stage and location Format. No.:-QAD-SOP-FS-003-F03-00 Page 8 of 12 Equipment intended for intermediate stage manufacturing operations.";
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 8,
        attachmentId: "urs",
        quote: page,
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-33",
            "Stage and location",
            "Equipment intended for intermediate stage manufacturing operations. [User Requirement Specification.PDF, p. 8]",
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
    expect(result.operation.kind).toBe("insert_rows");
    if (result.operation.kind === "insert_rows") {
      expect(result.operation.rows[0]?.[0]).toBe("URS-33");
      expect(result.operation.rows[0]?.[1]).toContain("Stage and location");
    }
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

describe("protocolBodyQuote", () => {
  it("strips Capacity/Size running-header chrome so leftover reactor is not a topic match", () => {
    const header =
      "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 1 of 60 UNCONTROLLED COPY Equipment Name Glass Lined Reactor";
    const body = protocolBodyQuote(header).toLowerCase();
    expect(body).not.toContain("capacity");
    expect(body).not.toMatch(/iqp/);
    expect(body).not.toContain("reactor");
    // Second call must not skip the start because of sticky /g lastIndex.
    expect(protocolBodyQuote(header)).toBe(protocolBodyQuote(header));
  });

  it("keeps jacket spec body after the same running header", () => {
    const page =
      "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 22 of 60 UNCONTROLLED COPY 13.3.5.1. Jacket Specifications Temperature −28.8/220";
    const body = protocolBodyQuote(page).toLowerCase();
    expect(body).toContain("jacket");
    expect(body).toContain("temperature");
    expect(body).not.toContain("capacity");
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

  it("blocks unsigned 15 °C on Temperature Minimum when the URS shows −15 °C", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote: "URS-3 Shell Operating temperature −15 °C to 130 °C",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "15 °C",
        context: "Temperature\nMinimum",
        section: "qsr_operating_range",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("15 °C");
    expect(
      extraQsrUnsupported({
        cell: "15",
        context: "Temperature\nMinimum",
        section: "qsr_operating_range",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("15");
    expect(
      extraQsrUnsupported({
        cell: "−15 °C",
        context: "Temperature\nMinimum",
        section: "qsr_operating_range",
        ledger,
      })
    ).toEqual([]);
  });

  it("blocks Temperature Minimum 15 even when URS-37 on the ledger is 15–130 °C", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote: "URS-3 Shell Operating temperature −15 °C to 130 °C",
      },
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "15 °C",
        context: "Temperature\nMinimum",
        section: "qsr_operating_range",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("15 °C");
  });

  it("still allows URS-37 15–130 °C when the shell URS is −15 °C", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote: "URS-3 Shell Operating temperature −15 °C to 130 °C",
      },
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "15–130 °C",
        context: "URS-37\nProcess temperature",
        section: "qsr_rtm_process",
        ledger,
      })
    ).toEqual([]);
  });

  it("blocks unsigned 15 °C on URS-3 when the column-major value is −15 °C", () => {
    const signedColumn =
      "URS ID # Parameters User requirements URS-1 Reactor Capacity URS-2 MOC URS-3 Shell Operating temperature URS-4 Shell Operating pressure URS-12 Jacket MOC Format. No.:-QAD-SOP-FS-003-F03-00 8000 L High-quality Glass Lining and thickness should not be less than 1 mm −15 °C to 130 °C Full Vacuum to 3.5 Kg/cm²";
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote: signedColumn,
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "15 °C to 130 °C",
        context: "URS-3\nShell Operating temperature",
        section: "qsr_rtm_process",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("15 °C to 130 °C");
    expect(
      extraQsrUnsupported({
        cell: "−15 °C to 130 °C",
        context: "URS-3\nShell Operating temperature",
        section: "qsr_rtm_process",
        ledger,
      })
    ).toEqual([]);
  });

  it("blocks unsigned 20 °C on URS-37 when the URS shows −20 °C to 150 °C", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 8,
        attachmentId: "urs",
        quote:
          "URS-37 Temperature To measure the temperature - 20 °C to 150 °C",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "20 °C",
        context: "URS-37\nTemperature",
        section: "qsr_rtm_process",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("20 °C");
    expect(
      extraQsrUnsupported({
        cell: "-20 °C to 150 °C",
        context: "URS-37\nTemperature",
        section: "qsr_rtm_process",
        ledger,
      })
    ).toEqual([]);
  });

  it("blocks unsigned 50±10 RPM when the URS shows −50 ± 10 RPM", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 7,
        attachmentId: "urs",
        quote: "URS-10 RPM requirement –50 ± 10 RPM",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "50+-10 RPM",
        context: "URS-10\nRPM requirement",
        section: "qsr_rtm_process",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("50+-10 RPM");
    expect(
      extraQsrUnsupported({
        cell: "~50 ± 10 RPM",
        context: "Agitator RPM",
        section: "qsr_operating_range",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("~50 ± 10 RPM");
    expect(
      extraQsrUnsupported({
        cell: "–50 ± 10 RPM",
        context: "URS-10\nRPM requirement",
        section: "qsr_rtm_process",
        ledger,
      })
    ).toEqual([]);
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

  it("blocks IQ on URS-1 when the IQ page is only the running header", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 1,
        attachmentId: "urs",
        quote:
          "URS-1 Reactor Capacity. Equipment Name Glass Lined Reactor Capacity 8000 L",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 1,
        attachmentId: "iq",
        quote:
          "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 1 of 60 UNCONTROLLED COPY Equipment Name Glass Lined Reactor",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "IQ",
        context:
          "URS-1\nReactor Capacity\n8000 L [User Requirement Specification.PDF, p. 1]\nIQ",
        section: "qsr_rtm_process",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("IQ");
  });

  it("keeps Complies when IQ Verified sits outside the URS-ID window and rowContext still names DQ", () => {
    const ledger = ledgerFromPages([
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 42,
        attachmentId: "iq",
        quote:
          "URS-40 URS-41 URS-42 13.7.5 Material of Construction Verification Nozzles & Manhole Gasket PTFE or equivalent Result: Verified",
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 13,
        attachmentId: "dq",
        quote: "URS-41 12.3 MOC Details Nozzles & Manhole Gasket Result: Verified",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "Complies",
        context:
          "URS-41\nGaskets\nPTFE or Equivalent\nIQ [Installation Qualification.PDF, p. 42]\nDQ [Design Qualification.PDF, p. 13]\n13.7.5\nComplies",
        section: "qsr_rtm_gmp",
        ledger,
      })
    ).toEqual([]);
  });

  it("keeps IQ when the IQ body describes jacket without a URS ID", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 22 of 60 UNCONTROLLED COPY 13.3.5.1. Jacket Specifications Temperature −28.8/220",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "IQ",
        context: "URS-5\nJacket temperature\n20-25 °C\nIQ\n13.3.5.1",
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

  it("maps IQP/DQP document numbers onto a family", () => {
    expect(documentFamilyFromFilename("IQP-GLR-1301.pdf")).toBe("iq");
    expect(documentFamilyFromFilename("DQP-GLR-1301.pdf")).toBe("dq");
    expect(documentFamilyFromFilename("OQP-GLR-1301.pdf")).toBe("oq");
    expect(documentFamilyFromFilename("PQP-GLR-1301.pdf")).toBe("pq");
    expect(documentFamilyFromContext("IQP/GLR-1301 jacket specifications")).toBe(
      "iq"
    );
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
    expect(rtmReferenceColumnIndexes("qsr_rtm_process")).toEqual({
      stage: 3,
      section: 4,
      remarks: 5,
    });
    expect(rtmReferenceColumnIndexes("qsr_rtm_control")).toEqual({
      stage: 4,
      section: 5,
      remarks: 6,
    });
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
    const result = groundTableOperation({
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
    expect(result.blocked).toBe(false);
    const keptRow =
      result.operation.kind === "insert_rows" ? result.operation.rows[0]! : [];
    expect(keptRow[0]).toContain("URS-5");
    expect(keptRow[1]).toBe("Jacket temperature");
    expect(keptRow[2]).toContain("20-25 °C");
    expect(keptRow.slice(3)).toEqual(["", "", ""]);
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

  it("keeps IQ / 13.3.5.1 when Installation Qualification describes the jacket without a URS ID", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 22 of 60 UNCONTROLLED COPY Shell thickness 12 mm. 13.3.5.1. Jacket Specifications Design Pressure Operating Pressure Temperature −28.8/220 Jacket Outer diameter Thickness 12 mm Volume 773 L Verification Verified By Date",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-5",
            "Jacket temperature",
            "20-25 °C",
            "IQ",
            "13.3.5.1",
            "Complies",
          ],
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
    expect(keptRow[3]).toContain("IQ");
    expect(keptRow[4]).toContain("13.3.5.1");
    expect(keptRow[5]).toBe("");
  });

  it("keeps Complies when the jacket IQ page records Verified as the result", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "13.3.5.1. Jacket Specifications Temperature −28.8/220 Jacket Outer diameter Thickness 12 mm Result: Verified",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-5",
            "Jacket temperature",
            "20-25 °C",
            "IQ",
            "13.3.5.1",
            "Complies",
          ],
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
    expect(keptRow[3]).toContain("IQ");
    expect(keptRow[4]).toContain("13.3.5.1");
    expect(keptRow[5]).toMatch(/Complies/i);
  });

  it("clears Stage / Complies when the IQ page is only the running header", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 1,
        attachmentId: "urs",
        quote:
          "URS-1 Reactor Capacity. Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 1,
        attachmentId: "iq",
        quote:
          "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 1 of 60 UNCONTROLLED COPY Equipment Name Glass Lined Reactor",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          ["URS-1", "Reactor Capacity", "8000 L", "IQ", "Section 13", "Complies"],
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
    expect(keptRow[0]).toContain("URS-1");
    expect(keptRow[1]).toBe("Reactor Capacity");
    expect(keptRow[2]).toContain("8000 L");
    expect(keptRow.slice(3)).toEqual(["", "", ""]);
  });

  it("clears Stage on edit_cells when IQ is only the running header", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 1,
        attachmentId: "urs",
        quote:
          "URS-1 Reactor Capacity. Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 1,
        attachmentId: "iq",
        quote:
          "Glass Lined Reactor Capacity/Size 8000 L IQP/GLR-1301 Page 1 of 60 UNCONTROLLED COPY Equipment Name Glass Lined Reactor",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 1, insertText: "Reactor Capacity" },
          {
            row: 1,
            col: 2,
            insertText: "8000 L [User Requirement Specification.PDF, p. 1]",
          },
          {
            row: 1,
            col: 3,
            insertText: "IQ",
            rowContext: "URS-1\nReactor Capacity",
          },
          {
            row: 1,
            col: 5,
            insertText: "Complies",
            rowContext: "URS-1\nReactor Capacity\nIQ",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    expect(cells.map((cell) => cell.insertText).join(" ")).toContain("8000 L");
    expect(cells.map((cell) => cell.insertText).join(" ")).not.toMatch(/\bIQ\b/);
    expect(cells.map((cell) => cell.insertText).join(" ")).not.toMatch(
      /Complies/i
    );
  });

  it("rewrites stock Section 13 to the jacket IQ heading", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "13.3.5.1. Jacket Specifications Temperature −28.8/220 Result: Verified",
      },
    ]);
    const result = groundTableOperation({
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
    expect(result.blocked).toBe(false);
    const keptRow =
      result.operation.kind === "insert_rows" ? result.operation.rows[0]! : [];
    expect(keptRow[3]).toContain("IQ");
    expect(keptRow[4]).toContain("13.3.5.1");
    expect(keptRow[5]).toMatch(/Complies/i);
  });

  it("keeps Full Vacuum to 3.5 Kg/cm² when OCR split the decimal", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote:
          "URS-1 Reactor Capacity URS-4 Shell Operating pressure URS-6 Jacket Operating Pressure 8000 L Full Vacuum to 3 . 5 Kg/cm² 3 to 5 Kg/cm²",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          ["URS-4", "Shell Operating pressure", "Full Vacuum to 3.5 Kg/cm²", "", "", ""],
          ["URS-6", "Jacket Operating Pressure", "3 to 5 Kg/cm²", "", "", ""],
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    const rows =
      result.operation.kind === "insert_rows" ? result.operation.rows : [];
    expect(rows.flat().join(" ")).toContain("3.5");
    expect(rows.flat().join(" ")).toContain("3 to 5");
    expect(rows.flat().join(" ")).not.toContain("<number>");
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

  it("keeps an explicit clear of filled Stage / Section / Remarks as a card", () => {
    const ledger = new CitationPageLedger();
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 2,
            col: 3,
            rowKey: "URS-9",
            expectedText: "PQ [Performance Qualification.PDF, p. 8]",
            insertText: "",
            rowContext: "URS-9\nPQ\n8.1\nComplies",
          },
          {
            row: 2,
            col: 4,
            rowKey: "URS-9",
            expectedText: "8.1",
            insertText: "",
            rowContext: "URS-9\nPQ\n8.1\nComplies",
          },
          {
            row: 2,
            col: 5,
            rowKey: "URS-9",
            expectedText: "Complies",
            insertText: "",
            rowContext: "URS-9\nPQ\n8.1\nComplies",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: {
        section: "qsr_rtm_process",
        attachedFilenames: ["User Requirement Specification.PDF"],
      },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    expect(cells).toHaveLength(3);
    expect(cells.every((cell) => cell.insertText === "")).toBe(true);
    expect(cells.map((cell) => cell.col).toSorted()).toEqual([3, 4, 5]);
  });

  it("sets DQ / Section 4 / NA from a Design Qualification N/A page", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 9,
        attachmentId: "urs",
        quote: "URS-51 Spare parts list to be provided by the vendor.",
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 18,
        attachmentId: "dq",
        quote:
          "URS-51 Spare parts list. Section 4. Vendor documentation. Result: N/A not applicable for this protocol.",
      },
    ]);
    expect(
      pickRtmReference(
        ledger,
        "URS-51",
        "URS-51\nSpare parts list\nDQ\n4\nNA"
      )
    ).toMatchObject({
      stageLabel: "DQ",
      sectionHeading: "4",
      remarks: "NA",
    });
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 6,
            col: 3,
            rowKey: "URS-51",
            expectedText: "",
            insertText: "DQ",
            rowContext: "URS-51\nSpare parts list",
          },
          {
            row: 6,
            col: 4,
            rowKey: "URS-51",
            expectedText: "",
            insertText: "4",
            rowContext: "URS-51\nSpare parts list",
          },
          {
            row: 6,
            col: 5,
            rowKey: "URS-51",
            expectedText: "",
            insertText: "NA",
            rowContext: "URS-51\nSpare parts list",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const byCol = new Map(cells.map((cell) => [cell.col, cell.insertText]));
    expect(byCol.get(3)).toMatch(/^DQ\b/);
    expect(byCol.get(3)).toContain("Design Qualification.PDF");
    expect(byCol.get(4)).toBe("4");
    expect(byCol.get(5)).toBe("NA");
  });

  it("rewrites DQ up to IQ when Installation Qualification also topic-matches", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 11,
        attachmentId: "dq",
        quote:
          "12.1 Jacket Design Temperature −28.8/220 Jacket volume 773 L",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "13.3.5.1. Jacket Specifications Temperature −28.8/220 Result: Verified",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-5",
            "Jacket temperature",
            "20-25 °C",
            "DQ",
            "12.1",
            "Complies",
          ],
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
    expect(keptRow[3]).toMatch(/^IQ\b/);
    expect(keptRow[3]).toContain("Installation Qualification.PDF");
    expect(keptRow[3]).not.toMatch(/\bDQ\b/);
    expect(keptRow[4]).toContain("13.3.5.1");
    expect(keptRow[5]).toMatch(/Complies/i);
  });

  it("prefers PQ over IQ when Performance Qualification also topic-matches", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "13.3.5.1. Jacket Specifications Temperature −28.8/220 Result: Verified",
      },
      {
        filename: "Performance Qualification.PDF",
        pageNumber: 20,
        attachmentId: "pq",
        quote:
          "8.2 Heating and cooling simulation Jacket temperature 20-25 °C Result: Verified",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-5",
            "Jacket temperature",
            "20-25 °C",
            "IQ",
            "13.3.5.1",
            "Complies",
          ],
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
    expect(keptRow[3]).toMatch(/^PQ\b/);
    expect(keptRow[3]).toContain("Performance Qualification.PDF");
    expect(keptRow[3]).not.toMatch(/\bIQ\b/);
    expect(keptRow[4]).toContain("8.2");
    expect(keptRow[5]).toMatch(/Complies/i);
  });

  it("does not invent Stage when the URS copy left the three cells empty", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 4,
        attachmentId: "urs",
        quote: SHARED_URS_PAGE,
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote:
          "13.3.5.1. Jacket Specifications Temperature −28.8/220 Result: Verified",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [["URS-5", "Jacket temperature", "20-25 °C", "", "", ""]],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    const keptRow =
      result.operation.kind === "insert_rows" ? result.operation.rows[0]! : [];
    expect(keptRow.slice(3)).toEqual(["", "", ""]);
  });

  it("does not let MOC alone pick a neighbour DQ material row", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote: COLUMN_URS_PAGE,
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 11,
        attachmentId: "dq",
        quote:
          "12.1 Material of Construction MOC SA 516 Gr.70 for the shell",
      },
    ]);
    expect(
      pickRtmReference(
        ledger,
        "URS-2",
        "URS-2\nMOC\nHigh-quality Glass Lining and thickness should not be less than 1 mm\nDQ"
      )
    ).toBeNull();
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "URS-2",
            "MOC",
            "High-quality Glass Lining and thickness should not be less than 1 mm",
            "DQ",
            "12.1",
            "Complies",
          ],
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    const keptRow =
      result.operation.kind === "insert_rows" ? result.operation.rows[0]! : [];
    expect(keptRow[0]).toContain("URS-2");
    expect(keptRow[2]).toContain("Glass Lining");
    expect(keptRow.slice(3)).toEqual(["", "", ""]);
  });

  it("keeps leftover <remarks> when no protocol page matches so lookup can search", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote:
          "URS-4 Shell Operating pressure Full Vacuum to 3.5 Kg/cm² URS-13 Jacket Type Limpet/Plain",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 5,
            rowKey: "URS-4",
            expectedText: "",
            insertText: "<remarks>",
            rowContext: "URS-4\nShell Operating pressure\nFull Vacuum to 3.5 Kg/cm²",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    expect(tablePlaceholderLabels(result.operation)).toContain("<remarks>");
    expect(
      result.operation.kind === "edit_cells"
        ? result.operation.cells.map((cell) => cell.insertText)
        : []
    ).toContain("<remarks>");
  });

  it("fills dummy-row Table 5 Stage/Section per rowKey from protocol pages, not <remarks>", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 6,
        attachmentId: "urs",
        quote:
          "URS-4 Shell Operating pressure Full Vacuum to 3.5 Kg/cm² URS-13 Jacket Type Limpet/Plain",
      },
      {
        filename: "Operational Qualification.PDF",
        pageNumber: 10,
        attachmentId: "oq",
        quote:
          "8.1 Shell Operating pressure Full Vacuum to 3.5 Kg/cm² Result: Verified",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 22,
        attachmentId: "iq",
        quote: "13.3.5.1 Jacket Type Limpet Result: Verified",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 3,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "<qualification stage>",
            rowContext: "URS-13\nJacket Type\nLimpet/Plain",
          },
          {
            row: 1,
            col: 4,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "<section>",
            rowContext: "URS-13\nJacket Type\nLimpet/Plain",
          },
          {
            row: 1,
            col: 5,
            rowKey: "URS-13",
            expectedText: "",
            insertText: "<remarks>",
            rowContext: "URS-13\nJacket Type\nLimpet/Plain",
          },
          {
            row: 1,
            col: 5,
            rowKey: "URS-4",
            expectedText: "",
            insertText: "<remarks>",
            rowContext:
              "URS-4\nShell Operating pressure\nFull Vacuum to 3.5 Kg/cm²",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_process" },
      clearOptionalOnBlock: true,
    });
    expect(result.blocked).toBe(false);
    expect(tablePlaceholderLabels(result.operation)).toEqual([]);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const byKey = (key: string) =>
      cells.filter(
        (cell) =>
          cell.rowKey === key || (cell.rowContext ?? "").includes(`${key}\n`)
      );
    const urs13 = byKey("URS-13")
      .map((cell) => cell.insertText)
      .join(" ");
    const urs4 = byKey("URS-4")
      .map((cell) => cell.insertText)
      .join(" ");
    expect(urs13).toMatch(/\bIQ\b/);
    expect(urs13).toContain("13.3.5.1");
    expect(urs13).toContain("Installation Qualification.PDF");
    expect(urs13).not.toContain("<remarks>");
    expect(urs13).not.toContain("8.1");
    expect(urs4).toMatch(/\bOQ\b/);
    expect(urs4).toContain("8.1");
    expect(urs4).toContain("Operational Qualification.PDF");
    expect(urs4).not.toContain("13.3.5.1");
    expect(urs4).not.toContain("<remarks>");
  });

  it("keeps Table 7 URS-41 IQ / 13.6 / Complies from live Gaskets when rowContext is only URS-41 / IQ / Complies", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 8,
        attachmentId: "urs",
        quote: "URS-41 Gaskets PTFE or Equivalent for non-product contact.",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 42,
        attachmentId: "iq",
        quote: "13.6 Gaskets PTFE or equivalent Result: Verified",
      },
    ]);
    const table7: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...QSR_RTM_HEADERS].map((header) => ({
                type: "tableHeader" as const,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: header }] },
                ],
              })),
            },
            ...[
              ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
              ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "", ""],
            ].map((row) => ({
              type: "tableRow" as const,
              content: row.map((text) => ({
                type: "tableCell" as const,
                content: text
                  ? [{ type: "paragraph", content: [{ type: "text", text }] }]
                  : [{ type: "paragraph" }],
              })),
            })),
          ],
        },
      ],
    };
    const cellsWithMetaRowContext = [
      {
        row: 1,
        col: 3,
        rowKey: "URS-41",
        expectedText: "",
        insertText: "IQ [Installation Qualification.PDF, p. 42]",
        rowContext: "URS-41\nIQ [Installation Qualification.PDF, p. 42]\n13.6\nComplies",
      },
      {
        row: 1,
        col: 4,
        rowKey: "URS-41",
        expectedText: "",
        insertText: "13.6",
        rowContext: "URS-41\nIQ [Installation Qualification.PDF, p. 42]\n13.6\nComplies",
      },
      {
        row: 1,
        col: 5,
        rowKey: "URS-41",
        expectedText: "",
        insertText: "Complies",
        rowContext: "URS-41\nIQ [Installation Qualification.PDF, p. 42]\n13.6\nComplies",
      },
    ];
    const droppedWithoutLiveRow = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: cellsWithMetaRowContext,
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_gmp" },
      clearOptionalOnBlock: true,
    });
    const droppedTexts =
      droppedWithoutLiveRow.operation.kind === "edit_cells"
        ? droppedWithoutLiveRow.operation.cells.map((cell) => cell.insertText)
        : [];
    expect(droppedTexts.join(" ")).toContain("13.6");
    expect(droppedTexts.join(" ")).not.toMatch(/\bIQ\b/);
    expect(droppedTexts.join(" ")).not.toMatch(/Complies/i);

    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: cellsWithMetaRowContext,
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_gmp" },
      clearOptionalOnBlock: true,
      fieldDoc: table7,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const urs41 = cells
      .filter((cell) => cell.rowKey === "URS-41")
      .map((cell) => cell.insertText)
      .join(" ");
    expect(urs41).toMatch(/\bIQ\b/);
    expect(urs41).toContain("13.6");
    expect(urs41).toContain("Installation Qualification.PDF");
    expect(urs41).toMatch(/Complies/i);

    const preview = buildTableOperationPreviewDoc(table7, result.operation, {
      id: "sug-table7-urs41",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const urs41Row = JSON.stringify(rows[2]);
    expect(urs41Row).toContain(suggestionInsertMarkName);
    expect(urs41Row).toMatch(/\bIQ\b/);
    expect(urs41Row).toContain("13.6");
    expect(urs41Row).toMatch(/Complies/i);
  });

  it("does not replace Table 7 URS-41 IQ 13.6 with DQ 12.3 from a URS-ID hit on Design Qualification", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 8,
        attachmentId: "urs",
        quote: "URS-41 Gaskets PTFE or Equivalent for non-product contact.",
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 13,
        attachmentId: "dq",
        quote:
          "URS-40 Contact parts SS 304. URS-41 12.3 MOC Details Nozzles & Manhole Gasket: PTFE enveloped asbestos-free inserts & SS corrugated ring Result: Verified. URS-42",
      },
    ]);
    const table7: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...QSR_RTM_HEADERS].map((header) => ({
                type: "tableHeader" as const,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: header }] },
                ],
              })),
            },
            ...[
              ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
              ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "13.6", ""],
            ].map((row) => ({
              type: "tableRow" as const,
              content: row.map((text) => ({
                type: "tableCell" as const,
                content: text
                  ? [{ type: "paragraph", content: [{ type: "text", text }] }]
                  : [{ type: "paragraph" }],
              })),
            })),
          ],
        },
      ],
    };
    expect(
      pickRtmReference(
        ledger,
        "URS-41",
        "URS-41\nGaskets\nPTFE or Equivalent [1]\n13.6\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies"
      )?.stageLabel
    ).toBe("DQ");
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 3,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "DQ [Design Qualification.PDF, p. 13]",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies",
          },
          {
            row: 1,
            col: 4,
            rowKey: "URS-41",
            expectedText: "13.6",
            insertText: "12.3",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies",
          },
          {
            row: 1,
            col: 5,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "Complies",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_gmp" },
      clearOptionalOnBlock: true,
      fieldDoc: table7,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const urs41 = cells.filter((cell) => cell.rowKey === "URS-41");
    const blob = urs41.map((cell) => cell.insertText).join(" ");
    expect(blob).not.toMatch(/\bDQ\b/);
    expect(blob).not.toContain("12.3");
    expect(blob).not.toMatch(/Complies/i);
    const section = urs41.find((cell) => cell.col === 4);
    if (section) expect(section.insertText).toBe("13.6");
    if (urs41.length === 0) return;

    const preview = buildTableOperationPreviewDoc(table7, result.operation, {
      id: "sug-table7-urs41-dq",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    if (!preview.ok) {
      expect(preview.status).toBe("already_present");
      return;
    }
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const sectionCell = JSON.stringify(
      (rows[2]?.content ?? []).filter(
        (node) => node.type === "tableCell" || node.type === "tableHeader"
      )[4]
    );
    expect(sectionCell).toContain("13.6");
    expect(sectionCell).not.toContain("12.3");
    expect(sectionCell).not.toContain(suggestionInsertMarkName);
  });

  it("fill-empty URS-41 only edits empty Stage/Remarks from IQ, not filled 13.6", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 8,
        attachmentId: "urs",
        quote: "URS-41 Gaskets PTFE or Equivalent for non-product contact.",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 42,
        attachmentId: "iq",
        quote: "13.6 Gaskets PTFE or equivalent Result: Verified",
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 13,
        attachmentId: "dq",
        quote:
          "URS-40 Contact parts SS 304. URS-41 12.3 MOC Details Nozzles & Manhole Gasket: PTFE enveloped asbestos-free inserts & SS corrugated ring Result: Verified. URS-42",
      },
    ]);
    const table7: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...QSR_RTM_HEADERS].map((header) => ({
                type: "tableHeader" as const,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: header }] },
                ],
              })),
            },
            ...[
              ["URS-40", "Non-Contact parts", "SS 304", "", "", ""],
              ["URS-41", "Gaskets", "PTFE or Equivalent [1]", "", "13.6", ""],
            ].map((row) => ({
              type: "tableRow" as const,
              content: row.map((text) => ({
                type: "tableCell" as const,
                content: text
                  ? [{ type: "paragraph", content: [{ type: "text", text }] }]
                  : [{ type: "paragraph" }],
              })),
            })),
          ],
        },
      ],
    };
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 3,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "DQ [Design Qualification.PDF, p. 13]",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies",
          },
          {
            row: 1,
            col: 4,
            rowKey: "URS-41",
            expectedText: "13.6",
            insertText: "12.3",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies",
          },
          {
            row: 1,
            col: 5,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "Complies",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_gmp" },
      clearOptionalOnBlock: true,
      fieldDoc: table7,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const urs41 = cells.filter((cell) => cell.rowKey === "URS-41");
    const blob = urs41.map((cell) => cell.insertText).join(" ");
    expect(blob).toMatch(/\bIQ\b/);
    expect(blob).toMatch(/Complies/i);
    expect(blob).not.toMatch(/\bDQ\b/);
    expect(blob).not.toContain("12.3");
    const section = urs41.find((cell) => cell.col === 4);
    expect(section).toBeUndefined();
    expect(urs41.some((cell) => cell.col === 3)).toBe(true);
    expect(urs41.some((cell) => cell.col === 5)).toBe(true);

    const preview = buildTableOperationPreviewDoc(table7, result.operation, {
      id: "sug-table7-urs41-fill-empty",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const cellsInRow = (rows[2]?.content ?? []).filter(
      (node) => node.type === "tableCell" || node.type === "tableHeader"
    );
    const sectionCell = JSON.stringify(cellsInRow[4]);
    expect(sectionCell).toContain("13.6");
    expect(sectionCell).not.toContain("12.3");
    expect(sectionCell).not.toContain(suggestionInsertMarkName);
    const stageCell = JSON.stringify(cellsInRow[3]);
    expect(stageCell).toMatch(/\bIQ\b/);
    expect(stageCell).toContain(suggestionInsertMarkName);
    const remarksCell = JSON.stringify(cellsInRow[5]);
    expect(remarksCell).toMatch(/Complies/i);
    expect(remarksCell).toContain(suggestionInsertMarkName);
  });

  it("does not stamp DQ Stage beside a filled Section heading from another family", () => {
    const ledger = ledgerFromPages([
      {
        filename: "Design Qualification.PDF",
        pageNumber: 13,
        attachmentId: "dq",
        quote:
          "URS-41 12.3 MOC Details Nozzles & Manhole Gasket: PTFE enveloped asbestos-free inserts Result: Verified",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 3,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "DQ [Design Qualification.PDF, p. 13]",
            rowContext: "URS-41\nGaskets\n13.6",
          },
          {
            row: 1,
            col: 4,
            rowKey: "URS-41",
            expectedText: "13.6",
            insertText: "12.3",
            rowContext: "URS-41\nGaskets\n13.6",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_gmp" },
      clearOptionalOnBlock: true,
      fieldDoc: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [...QSR_RTM_HEADERS].map((header) => ({
                  type: "tableHeader" as const,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: header }],
                    },
                  ],
                })),
              },
              {
                type: "tableRow",
                content: [
                  "URS-41",
                  "Gaskets",
                  "PTFE or Equivalent [1]",
                  "",
                  "13.6",
                  "",
                ].map((text) => ({
                  type: "tableCell" as const,
                  content: text
                    ? [{ type: "paragraph", content: [{ type: "text", text }] }]
                    : [{ type: "paragraph" }],
                })),
              },
            ],
          },
        ],
      },
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const blob = cells.map((cell) => cell.insertText).join(" ");
    expect(blob).not.toMatch(/\bDQ\b/);
    expect(blob).not.toContain("12.3");
    expect(cells.find((cell) => cell.col === 4)).toBeUndefined();
  });

  it("treats Verified after the next URS ID as a page-level pass token without topic match", () => {
    const iqQuote =
      "URS-40 URS-41 URS-42 13.6 Gaskets PTFE or equivalent Result: Verified";
    const ledger = ledgerFromPages([
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 42,
        attachmentId: "iq",
        quote: iqQuote,
      },
    ]);
    expect(quoteWindowAroundKey(iqQuote, "URS-41")).not.toMatch(/Verified/i);
    const pick = pickRtmReference(ledger, "URS-41", "URS-41");
    expect(pick?.stageLabel).toBe("IQ");
    expect(pick?.remarks).toBe("Complies");
  });

  it("paints Complies when URS-41 is on the IQ page but Verified sits outside the ID window", () => {
    const iqQuote =
      "URS-40 URS-41 URS-42 13.6 Gaskets PTFE or equivalent Result: Verified";
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 8,
        attachmentId: "urs",
        quote: "URS-41 Gaskets PTFE or Equivalent for non-product contact.",
      },
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 42,
        attachmentId: "iq",
        quote: iqQuote,
      },
    ]);
    expect(quoteWindowAroundKey(iqQuote, "URS-41")).not.toMatch(/Verified/i);
    const pick = pickRtmReference(
      ledger,
      "URS-41",
      "URS-41\nGaskets\nPTFE or Equivalent [1]\n13.6"
    );
    expect(pick?.stageLabel).toBe("IQ");
    expect(pick?.remarks).toBe("Complies");

    const table7: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [...QSR_RTM_HEADERS].map((header) => ({
                type: "tableHeader" as const,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: header }] },
                ],
              })),
            },
            {
              type: "tableRow",
              content: [
                "URS-41",
                "Gaskets",
                "PTFE or Equivalent [1]",
                "",
                "13.6",
                "",
              ].map((text) => ({
                type: "tableCell" as const,
                content: text
                  ? [{ type: "paragraph", content: [{ type: "text", text }] }]
                  : [{ type: "paragraph" }],
              })),
            },
          ],
        },
      ],
    };
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 3,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "IQ [Installation Qualification.PDF, p. 42]",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n13.7.5\nComplies",
          },
          {
            row: 1,
            col: 4,
            rowKey: "URS-41",
            expectedText: "13.6",
            insertText: "13.7.5",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n13.7.5\nComplies",
          },
          {
            row: 1,
            col: 5,
            rowKey: "URS-41",
            expectedText: "",
            insertText: "Complies",
            rowContext:
              "URS-41\nDQ [Design Qualification.PDF, p. 13]\n13.7.5\nComplies",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: { section: "qsr_rtm_gmp" },
      clearOptionalOnBlock: true,
      fieldDoc: table7,
    });
    expect(result.blocked).toBe(false);
    const cells =
      result.operation.kind === "edit_cells" ? result.operation.cells : [];
    const urs41 = cells.filter((cell) => cell.rowKey === "URS-41");
    expect(urs41.map((cell) => cell.insertText).join(" ")).toMatch(/Complies/i);
    expect(urs41.find((cell) => cell.col === 5)?.insertText).toMatch(/Complies/i);
    expect(urs41.find((cell) => cell.col === 4)).toBeUndefined();

    const preview = buildTableOperationPreviewDoc(table7, result.operation, {
      id: "sug-table7-urs41-complies-outside-id-window",
      authorId: "ai",
      status: "pending",
      createdAt: "2026-09-27T00:00:00.000Z",
      kind: "fix",
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const table = (preview.doc.content ?? []).find((node) => node.type === "table");
    const rows = (table?.content ?? []).filter((node) => node.type === "tableRow");
    const cellsInRow = (rows[1]?.content ?? []).filter(
      (node) => node.type === "tableCell" || node.type === "tableHeader"
    );
    const remarksCell = JSON.stringify(cellsInRow[5]);
    expect(remarksCell).toMatch(/Complies/i);
    expect(remarksCell).toContain(suggestionInsertMarkName);
    const sectionCell = JSON.stringify(cellsInRow[4]);
    expect(sectionCell).toContain("13.6");
    expect(sectionCell).not.toContain(suggestionInsertMarkName);
  });

  it("still prefers IQ 13.6 over DQ 12.3 when both protocol pages are cited", () => {
    const ledger = ledgerFromPages([
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 42,
        attachmentId: "iq",
        quote: "13.6 Gaskets PTFE or equivalent Result: Verified",
      },
      {
        filename: "Design Qualification.PDF",
        pageNumber: 13,
        attachmentId: "dq",
        quote:
          "URS-41 12.3 MOC Details Nozzles & Manhole Gasket: PTFE enveloped asbestos-free inserts & SS corrugated ring Result: Verified",
      },
    ]);
    const pick = pickRtmReference(
      ledger,
      "URS-41",
      "URS-41\nGaskets\nPTFE or Equivalent [1]\nDQ [Design Qualification.PDF, p. 13]\n12.3\nComplies"
    );
    expect(pick?.stageLabel).toBe("IQ");
    expect(pick?.sectionHeading).toContain("13.6");
    expect(pick?.filename).toContain("Installation Qualification");
  });

  it("drops leftover RTM placeholders so <remarks> never persist after lookup", () => {
    const dropped = dropQsrRtmPlaceholderCells(
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 2,
            rowKey: "URS-4",
            insertText: "Full Vacuum to 3.5 Kg/cm²",
          },
          {
            row: 1,
            col: 4,
            rowKey: "URS-4",
            insertText: "<section>",
          },
          {
            row: 1,
            col: 5,
            rowKey: "URS-4",
            insertText: "<remarks>",
          },
        ],
      }
    );
    expect(dropped).toMatchObject({
      kind: "edit_cells",
      cells: [
        {
          col: 2,
          insertText: "Full Vacuum to 3.5 Kg/cm²",
        },
      ],
    });
  });
});

// Real 3xper GLR-1301 IQ transcripts (Langfuse trace 256f0e5d…, 14:54 edit_cells).
// Executed IQ records print Actual observation / Verified By (Sign & Date)
// with signed dates and never a pass word.
const IQ_P25_AGITATOR_MOTOR =
  "3xper EMPOWERING INNOVATION Issued By MASTER COPY Issued On INSTALLATION QUALIFICATION Carat Kumar Gedla 3xper Innoventure Limited, 30/04/202619:20 Equipment/System Glass Lined Reactor Protocol No. Report No. IQP/GLR-1301 IQR/GLR-1301 Equipment Number GLR-1301 13.3.5.4. Agitator Motor Specifications Revision: 01 Page No. Section Revision: 01 Capacity/Size Effective Date 25 of 60 Production Block-2 8000 L 30-04-2026 Sr. No Parameters 1. Make Actual Verification Verified By Design specifications observations Source (Sign & Date) Design Crompton Crompton 2. Type mounted 3. Motor speed 1470 rpm 14708pm Flame proof, Flange Flame Proof, Analification Afita Design 01-05-2006 01-05-2026 Flange mounted qualification R.Ajita Design qualification R. Ajith 01-05-2026 4. Motor Power 15 HP (11 KW) 15 HP (11kw) GA Drawing R.Alith 01-05-2026";
const IQ_P18_IDENTIFICATION =
  "Issued By Carat Kumar Yedla 3xper EMPOWERING INNOVAT ON MASTER COPY 3xper Innoventure Limited, Issued On 30/04/202619:20 INSTALLATION QUALIFICATION Equipment/System Glass Lined Reactor Page No. 18 of 60 Protocol No. IQP/GLR-1301 Revision: 01 Section Production Block-2 Report No. IQR/GLR-1301 Revision: 01 Capacity/Size 8000 L Equipment Number GLR-1301 Effective Date 30-04-2026 13.3. System Identification & technical specification verification 13.3.1. Rationale To check and record the system identity of Equipment Reactor S. No Description Actual Observation Verified By (Sign & Date) 1.0 Name of the equipment Glass Lined Reactor R.Ajita 2.0 Manufacturer Standard Glass Lining Technology Ltd 01-05-2026 RANG 01-05-2026 3.0 Model Number NA RANG 01-05-2076 4.0 Serial Number £250710956 RAjith 01-05-2026 5.0 Capacity / Size 8000L R.Ajith 01-05-2026 6.0 Operating ranges -20°to 220℃ 4.5/FV RA 01-05-2026 7.0 Equipment Identification GLR-1301 RAJ윈도 01-05-2026 Format. No: QAD-SOP-FS-003-F10-00 CONTROLLED COPY";

describe("RTM Remarks from executed protocol records", () => {
  const iqLedger = (quote: string, pageNumber = 25) =>
    ledgerFromPages([
      {
        filename: "Installation Qualification.PDF",
        pageNumber,
        attachmentId: "iq",
        quote,
      },
    ]);

  it("gives Complies to an executed IQ spec table with signed dates and no pass word", () => {
    expect(
      pickRtmReference(
        iqLedger(IQ_P25_AGITATOR_MOTOR),
        "URS-7",
        "URS-7\nAgitator\nAgitator motor flame proof flange mounted"
      )
    ).toMatchObject({
      stageLabel: "IQ",
      pageNumber: 25,
      remarks: "Complies",
    });
  });

  it("does not let a stray `Model Number NA` cell make the row NA", () => {
    expect(
      pickRtmReference(
        iqLedger(IQ_P18_IDENTIFICATION, 18),
        "URS-13",
        "URS-13\nEquipment identification\nManufacturer name plate and serial number"
      )
    ).toMatchObject({ stageLabel: "IQ", remarks: "Complies" });
  });

  it("keeps an unexecuted IQ template (no signature dates) empty", () => {
    expect(
      pickRtmReference(
        iqLedger(
          "INSTALLATION QUALIFICATION Effective Date 30-04-2026 13.3.5.4. Agitator Motor Specifications Parameters Design specifications Actual observations Verification Source Verified By (Sign & Date) Make Crompton Motor speed 1470 rpm Flame proof"
        ),
        "URS-7",
        "URS-7\nAgitator\nAgitator motor flame proof"
      )?.remarks
    ).toBe("");
  });

  it("keeps an executed record that failed empty", () => {
    expect(
      pickRtmReference(
        iqLedger(
          `${IQ_P25_AGITATOR_MOTOR} Remarks: motor speed does not meet design specification`
        ),
        "URS-7",
        "URS-7\nAgitator\nAgitator motor flame proof"
      )?.remarks
    ).toBe("");
  });

  it("gives NA only for a labeled result N/A, not a spec cell", () => {
    expect(
      pickRtmReference(
        iqLedger(`${IQ_P25_AGITATOR_MOTOR} Result: N/A for this equipment`),
        "URS-7",
        "URS-7\nAgitator\nAgitator motor flame proof"
      )?.remarks
    ).toBe("NA");
  });

  it("lets stock Complies on an IQ row persist when that IQ record was executed", () => {
    const context =
      "URS-7\nAgitator\nAgitator motor flame proof flange mounted\nIQ [Installation Qualification.PDF, p. 25]\n13.3.5.4";
    expect(
      qsrRtmCellUnsupported("Complies", context, iqLedger(IQ_P25_AGITATOR_MOTOR))
    ).toBeNull();
  });
});

describe("shouldKeepRtmProtocolSearchOpen", () => {
  it("keeps search open after an identifier-only hit on Design Qualification", () => {
    expect(
      shouldKeepRtmProtocolSearchOpen(
        ["URS-41"],
        ["Design Qualification.PDF"]
      )
    ).toBe(true);
  });

  it("keeps search open after an IQ hit until PQ and OQ are queried", () => {
    expect(
      shouldKeepRtmProtocolSearchOpen(
        ["URS-41", "installation qualification gaskets"],
        ["Design Qualification.PDF", "Installation Qualification.PDF"]
      )
    ).toBe(true);
  });

  it("closes once every higher protocol family than the best hit was queried", () => {
    expect(
      shouldKeepRtmProtocolSearchOpen(
        [
          "URS-41",
          "installation qualification gaskets",
          "operational qualification gaskets",
          "performance qualification gaskets",
        ],
        ["Installation Qualification.PDF"]
      )
    ).toBe(false);
  });

  it("closes when PQ is already the best hit", () => {
    expect(
      shouldKeepRtmProtocolSearchOpen(
        ["performance qualification gaskets"],
        ["Performance Qualification.PDF"]
      )
    ).toBe(false);
  });

  it("does not keep search open for a non-protocol identifier hit", () => {
    expect(
      shouldKeepRtmProtocolSearchOpen(
        ["URS-41"],
        ["User Requirement Specification.PDF"]
      )
    ).toBe(false);
  });
});

const OQ_SOP_HEADER_PAGE = [
  "Operational Qualification Glass Lined Reactor",
  "Document No. OQP/GLR-1301 Effective Date 16-05-2026 Format No. QAD-SOP-FS-003-F02 Page 51 of 85",
  "Observation: visual inspection completed. Date 19 May 2026",
  "Done By Sign & Date 19-05-2026 Checked By Sign & Date 19-05-2026",
].join("\n");

describe("dateSupportedAsLabeledField", () => {
  it("keeps the date next to Effective Date when a signature date is also on the page", () => {
    const labeled = extractHardFacts("16-05-2026").find(
      (row) => row.kind === "date"
    )!;
    const signature = extractHardFacts("19-05-2026").find(
      (row) => row.kind === "date"
    )!;
    expect(
      dateSupportedAsLabeledField(
        OQ_SOP_HEADER_PAGE,
        labeled,
        "Effective Date"
      )
    ).toBe(true);
    expect(
      dateSupportedAsLabeledField(
        OQ_SOP_HEADER_PAGE,
        signature,
        "Effective Date"
      )
    ).toBe(false);
  });

  it("uses the first date after the label when a signature date sits in the same window", () => {
    const quote = "Effective Date 16-05-2026 Sign & Date 19-05-2026";
    const labeled = extractHardFacts("16-05-2026").find(
      (row) => row.kind === "date"
    )!;
    const signature = extractHardFacts("19-05-2026").find(
      (row) => row.kind === "date"
    )!;
    expect(dateSupportedAsLabeledField(quote, labeled, "Effective Date")).toBe(
      true
    );
    expect(
      dateSupportedAsLabeledField(quote, signature, "Effective Date")
    ).toBe(false);
  });

  it("fails open when the page has no matching date label", () => {
    const fact = extractHardFacts("19-05-2026").find(
      (row) => row.kind === "date"
    )!;
    expect(
      dateSupportedAsLabeledField(
        "Done By Sign & Date 19-05-2026",
        fact,
        "Effective Date"
      )
    ).toBeNull();
  });

  it("accepts either half of an Effective Date / Approved date header", () => {
    const quote =
      "Cover. Effective Date 01-04-2026. Protocol approved date 02-04-2026.";
    const effective = extractHardFacts("01-04-2026").find(
      (row) => row.kind === "date"
    )!;
    const approved = extractHardFacts("02-04-2026").find(
      (row) => row.kind === "date"
    )!;
    const other = extractHardFacts("19-05-2026").find(
      (row) => row.kind === "date"
    )!;
    expect(
      dateSupportedAsLabeledField(
        quote,
        effective,
        "Effective Date / Approved date"
      )
    ).toBe(true);
    expect(
      dateSupportedAsLabeledField(
        quote,
        approved,
        "Effective Date / Approved date"
      )
    ).toBe(true);
    expect(
      dateSupportedAsLabeledField(
        `${quote} Sign & Date 19-05-2026`,
        other,
        "Effective Date / Approved date"
      )
    ).toBe(false);
  });
});

describe("groundTableOperation QSR SOP Effective Date", () => {
  const ledger = () =>
    ledgerFromPages([
      {
        filename: "Operational Qualification.PDF",
        pageNumber: 51,
        attachmentId: "att-oq",
        quote: OQ_SOP_HEADER_PAGE,
      },
    ]);

  it("rejects a signature date in the Effective Date column", () => {
    expect(qsrTableColumnLabel("qsr_sops", 2)).toBe("Effective Date");
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 2,
            insertText:
              "19-05-2026 [Operational Qualification.PDF, p. 51]",
          },
        ],
      },
      ledger: ledger(),
      policy: "block",
      grounding: { section: "qsr_sops" },
    });
    expect(result.blocked).toBe(true);
    expect(result.operation).toMatchObject({
      kind: "edit_cells",
      cells: [
        {
          insertText: expect.stringContaining("<date>"),
        },
      ],
    });
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).not.toContain("19-05-2026");
  });

  it("accepts the labeled Effective Date from the same cited page", () => {
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 2,
            insertText:
              "16-05-2026 [Operational Qualification.PDF, p. 51]",
          },
        ],
      },
      ledger: ledger(),
      policy: "block",
      grounding: { section: "qsr_sops" },
    });
    expect(result.blocked).toBe(false);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).toContain("16-05-2026");
    expect(cell).not.toContain("<date>");
  });

  it("still presence-grounds a SOP Number on that page", () => {
    const numbered = ledgerFromPages([
      {
        filename: "Operational Qualification.PDF",
        pageNumber: 11,
        attachmentId: "att-oq-sop",
        quote: "SOP Number SOP/PR/OQ/014 Effective Date 16-05-2026",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 1,
            insertText: "SOP/PR/OQ/014 [Operational Qualification.PDF, p. 11]",
          },
        ],
      },
      ledger: numbered,
      policy: "block",
      grounding: { section: "qsr_sops" },
    });
    expect(result.blocked).toBe(false);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).toContain("SOP/PR/OQ/014");
  });
});
