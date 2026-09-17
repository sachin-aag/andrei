import { describe, expect, it, vi } from "vitest";
import { CitationPageLedger } from "./citation-grounding";
import {
  repairSearchQueries,
  repairTextsFromTableOperation,
  searchUnsupportedFactsRepair,
  seedRepairHits,
  unsupportedFactsRepairMessage,
} from "./unsupported-facts-repair";
import { UNSUPPORTED_FACTS_RETRY_MESSAGE } from "./ground-draft";

vi.mock("@/lib/attachments/retrieval", () => ({
  searchReportDocumentsMany: vi.fn(),
}));

import { searchReportDocumentsMany } from "@/lib/attachments/retrieval";

describe("repairSearchQueries", () => {
  it("uses unsourced fact text so a blocked ID can be grepped", () => {
    expect(
      repairSearchQueries({
        unsupported: [
          {
            text: "MF-24-PR-001",
            kind: "identifier",
            normalized: "MF-24-PR-001",
            start: 0,
            end: 12,
            cited: [],
          },
        ],
      })
    ).toEqual(["MF-24-PR-001"]);
  });

  it("pairs leftover placeholders with nearby row context", () => {
    const queries = repairSearchQueries({
      texts: ["EQ-12 Balance <cal due date> [Planner.pdf, p. 22]"],
    });
    expect(queries.some((query) => query.includes("EQ-12"))).toBe(true);
    expect(queries.some((query) => /cal due date/i.test(query))).toBe(true);
    expect(queries.some((query) => query.includes("Planner.pdf"))).toBe(false);
  });

  it("builds insert_rows queries from sibling cells", () => {
    const texts = repairTextsFromTableOperation({
      kind: "insert_rows",
      tableIndex: 0,
      rows: [["EQ-12 Balance", "<cal due date>", "<certificate reference>"]],
    });
    const queries = repairSearchQueries({ texts });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((query) => query.includes("EQ-12"))).toBe(true);
  });
});

describe("seedRepairHits", () => {
  it("returns only pages that newly gained a quote", () => {
    const ledger = new CitationPageLedger();
    ledger.record("Planner.pdf", 22, "att-plan", {
      quote: "EQ-12 Balance due — see certificate",
    });
    ledger.record("Cert.pdf", 5, "att-cert");
    const fresh = seedRepairHits(ledger, [
      {
        attachmentId: "att-plan",
        filename: "Planner.pdf",
        pageNumber: 22,
        quote: "EQ-12 Balance due — see certificate",
        citationId: "att:att-plan:p:22",
      },
      {
        attachmentId: "att-cert",
        filename: "Cert.pdf",
        pageNumber: 5,
        quote: "EQ-12 due 12/03/2026 cert 2025/014",
        citationId: "att:att-cert:p:5",
      },
    ]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.filename).toBe("Cert.pdf");
    expect(ledger.hasQuotedPages()).toBe(true);
    expect(
      ledger.recordedPages().find((page) => page.pageNumber === 5)?.quote
    ).toContain("12/03/2026");
  });
});

describe("searchUnsupportedFactsRepair", () => {
  it("dedupes hits and skips empty quotes", async () => {
    vi.mocked(searchReportDocumentsMany).mockResolvedValueOnce([
      [
        {
          attachmentId: "att_pqr",
          filename: "PQR-24-PR-042.pdf",
          description: null,
          pageNumber: 21,
          chunkId: "c1",
          sourceKind: "hybrid",
          text: "Media fill MF-24-PR-001 on 15/07/2024",
          quote: "Media fill MF-24-PR-001 on 15/07/2024",
          citationId: "att:att_pqr:p:21",
          ingestRunId: "run",
        },
        {
          attachmentId: "att_pqr",
          filename: "PQR-24-PR-042.pdf",
          description: null,
          pageNumber: 21,
          chunkId: "c2",
          sourceKind: "hybrid",
          text: "Media fill MF-24-PR-001 on 15/07/2024",
          quote: "Media fill MF-24-PR-001 on 15/07/2024",
          citationId: "att:att_pqr:p:21",
          ingestRunId: "run",
        },
      ],
    ]);
    const hits = await searchUnsupportedFactsRepair({
      reportId: "rep_1",
      queries: ["MF-24-PR-001"],
    });
    expect(hits).toHaveLength(1);
    expect(unsupportedFactsRepairMessage(hits)).toContain(
      "[PQR-24-PR-042.pdf, p. 21]"
    );
    expect(unsupportedFactsRepairMessage(hits)).toContain(
      UNSUPPORTED_FACTS_RETRY_MESSAGE
    );
  });
});
