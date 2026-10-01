import { describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  hasPopulatedTablePlaceholders,
  isPlaceholderFillTurn,
  placeholderFillQueries,
  renderPlaceholderFillEvidence,
  stripPlaceholderLabel,
} from "./placeholder-fill";
import { searchPlaceholderFill } from "./placeholder-fill-search";
import { classifyRetrievalPolicy } from "./retrieval-policy";
import { CitationPageLedger } from "./citation-grounding";

vi.mock("@/lib/attachments/retrieval", () => ({
  searchReportDocumentsMany: vi.fn(),
}));

import { searchReportDocumentsMany } from "@/lib/attachments/retrieval";

function textCell(
  type: "tableHeader" | "tableCell",
  text: string
): JSONContent {
  return {
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function tableDoc(headers: string[], rows: string[][]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: headers.map((header) => textCell("tableHeader", header)),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: row.map((cell) => textCell("tableCell", cell)),
          })),
        ],
      },
    ],
  };
}

const pmTable = {
  table: tableDoc(
    ["Document", "Date", "Identifier"],
    [
      ["PM-EL-12 Preventive maintenance", "<date>", "<identifier>"],
      ["QMS/CAPA-04", "2024-01-12", "CAPA-24-003"],
    ]
  ),
};

describe("isPlaceholderFillTurn", () => {
  it("matches fill/complete/replace of placeholders", () => {
    expect(
      isPlaceholderFillTurn("fill the placeholders in tables 9–11")
    ).toBe(true);
    expect(isPlaceholderFillTurn("complete remaining placeholders")).toBe(
      true
    );
    expect(isPlaceholderFillTurn("replace the <date> placeholders")).toBe(
      true
    );
  });

  it("does not match an empty-inventory table fill", () => {
    expect(
      isPlaceholderFillTurn("Fill the table with the requirement rows")
    ).toBe(false);
    expect(
      isPlaceholderFillTurn("populate the results matrix with the complete set")
    ).toBe(false);
  });
});

describe("placeholderFillQueries", () => {
  it("builds row-key + column + label queries and skips filled cells", () => {
    const queries = placeholderFillQueries({
      elr_preventive_maintenance: pmTable,
    });
    expect(queries.map((item) => item.query)).toEqual(
      expect.arrayContaining([
        "PM-EL-12 Preventive maintenance Date date Preventive Maintenance",
        "PM-EL-12 Preventive maintenance Identifier identifier Preventive Maintenance",
      ])
    );
    expect(queries.some((item) => item.query.includes("CAPA-24-003"))).toBe(
      false
    );
  });

  it("treats header-only tables as not populated", () => {
    const empty = {
      table: tableDoc(["Document", "Date"], []),
    };
    expect(hasPopulatedTablePlaceholders({ elr_preventive_maintenance: empty })).toBe(
      false
    );
    expect(placeholderFillQueries({ elr_preventive_maintenance: empty })).toEqual(
      []
    );
  });

  it("strips angle and to-be-filled wrappers", () => {
    expect(stripPlaceholderLabel("<date>")).toBe("date");
    expect(stripPlaceholderLabel("[SOP number: <to be filled>]")).toBe(
      "SOP number"
    );
  });
});

describe("classifyRetrievalPolicy placeholder_fill", () => {
  it("keeps a populated placeholder fill adaptive instead of a page walk", () => {
    expect(
      classifyRetrievalPolicy({
        userText: "fill the placeholders in tables 9–11",
        hasDocuments: true,
        totalReadyPages: 273,
        documentType: "equipment_lifecycle_report",
        hasPopulatedPlaceholders: true,
      })
    ).toEqual({ policy: "adaptive", reason: "placeholder_fill" });
  });

  it("still walks when the table is an empty inventory", () => {
    expect(
      classifyRetrievalPolicy({
        userText: "fill the placeholders in the calibration table",
        hasDocuments: true,
        totalReadyPages: 273,
        documentType: "equipment_lifecycle_report",
        hasPopulatedPlaceholders: false,
      }).policy
    ).toBe("comprehensive");
  });

  it("does not change an empty-inventory fill that never mentioned placeholders", () => {
    expect(
      classifyRetrievalPolicy({
        userText: "Fill the table with the requirement rows",
        sectionScope: "traceability",
        hasDocuments: true,
      })
    ).toEqual({
      policy: "comprehensive",
      reason: "matrix_section_inventory",
    });
  });
});

describe("searchPlaceholderFill", () => {
  it("batches queries and seeds a citation ledger from hits", async () => {
    vi.mocked(searchReportDocumentsMany).mockResolvedValueOnce([
      [
        {
          attachmentId: "att_pm",
          filename: "PM-log.pdf",
          description: null,
          pageNumber: 4,
          chunkId: "c1",
          sourceKind: "hybrid",
          text: "PM-EL-12 performed 12 Jan 2024",
          quote: "PM-EL-12 performed 12 Jan 2024",
          citationId: "att:att_pm:p:4",
          ingestRunId: "run",
        },
      ],
    ]);
    const result = await searchPlaceholderFill({
      reportId: "rep_1",
      sections: { elr_preventive_maintenance: pmTable },
    });
    expect(result.queries.length).toBeGreaterThan(0);
    expect(result.hits).toHaveLength(1);
    const ledger = new CitationPageLedger();
    for (const hit of result.hits) {
      ledger.record(hit.filename, hit.pageNumber, hit.attachmentId, {
        quote: hit.quote,
        citationId: hit.citationId,
      });
    }
    expect(ledger.decision("PM-log.pdf", 4)).toBe("keep");
    expect(ledger.hasQuotedPages()).toBe(true);
    expect(renderPlaceholderFillEvidence(result.hits)).toContain(
      "[PM-log.pdf, p. 4]"
    );
  });
});
