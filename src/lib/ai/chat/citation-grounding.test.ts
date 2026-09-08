import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  CitationPageLedger,
  rewriteCitationPagesInText,
  rewriteTableOperationCitations,
} from "@/lib/ai/chat/citation-grounding";

function ledgerWithSearchHit(filename: string, page: number, id = "att-1") {
  const ledger = new CitationPageLedger();
  ledger.record(filename, page, id);
  return ledger;
}

describe("CitationPageLedger", () => {
  it("seeds pages from a prior search_documents tool result", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-search_documents",
            toolCallId: "call_search",
            state: "output-available",
            input: { query: "scope" },
            output: {
              results: [
                {
                  filename: "protocol.pdf",
                  pageNumber: 12,
                  attachmentId: "att-1",
                  citation: "[protocol.pdf, p. 12]",
                },
              ],
              seenPages: [
                {
                  filename: "protocol.pdf",
                  pageNumber: 12,
                  attachmentId: "att-1",
                },
              ],
            },
          },
        ],
      },
    ];
    const ledger = new CitationPageLedger();
    ledger.seedFromMessages(messages);
    expect(ledger.decision("protocol.pdf", 12)).toBe("keep");
    expect(ledger.decision("protocol.pdf", 104)).toBe("drop");
  });

  it("seeds pages from finish_document_review citationDigest", () => {
    const ledger = new CitationPageLedger();
    ledger.seedFromMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-finish_document_review",
            toolCallId: "call_finish",
            state: "output-available",
            input: {},
            output: {
              citationDigest: [
                {
                  filename: "Protocol.pdf",
                  pageNumber: 118,
                  citation: "[Protocol.pdf, p. 118]",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(ledger.decision("Protocol.pdf", 118)).toBe("keep");
    expect(ledger.decision("Protocol.pdf", 104)).toBe("drop");
  });

  it("does not treat document_outline pages as evidence", () => {
    const ledger = new CitationPageLedger();
    ledger.seedFromMessages([
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-document_outline",
            toolCallId: "call_outline",
            state: "output-available",
            input: { attachmentId: "att-1" },
            output: {
              filename: "protocol.pdf",
              pages: [{ pageNumber: 104, pageContext: "footer" }],
            },
          },
        ],
      },
    ]);
    expect(ledger.decision("protocol.pdf", 104)).toBe("unknown");
  });
});

describe("rewriteCitationPagesInText", () => {
  it("drops a page the tools never returned and keeps the filename cite", () => {
    const ledger = ledgerWithSearchHit("protocol.pdf", 12);
    expect(
      rewriteCitationPagesInText(
        "The objective is verification [protocol.pdf, p. 104].",
        ledger
      )
    ).toBe("The objective is verification [protocol.pdf].");
  });

  it("keeps a page that search actually served", () => {
    const ledger = ledgerWithSearchHit("protocol.pdf", 12);
    expect(
      rewriteCitationPagesInText("See [protocol.pdf, p. 12].", ledger)
    ).toBe("See [protocol.pdf, p. 12].");
  });

  it("leaves cites alone when no pages were recorded for that file", () => {
    const ledger = new CitationPageLedger();
    expect(
      rewriteCitationPagesInText("See [protocol.pdf, p. 104].", ledger)
    ).toBe("See [protocol.pdf, p. 104].");
  });

  it("keeps grounded pages in a multi-page cite and drops the rest", () => {
    const ledger = ledgerWithSearchHit("protocol.pdf", 4);
    ledger.record("protocol.pdf", 26, "att-1");
    expect(
      rewriteCitationPagesInText("[protocol.pdf, p. 4, 104]", ledger)
    ).toBe("[protocol.pdf, p. 4]");
  });

  it("leaves appendix-style cites that do not match an attachment", () => {
    const ledger = ledgerWithSearchHit("protocol.pdf", 12);
    expect(
      rewriteCitationPagesInText("See [Appendix B, p. 104].", ledger)
    ).toBe("See [Appendix B, p. 104].");
  });
});

describe("rewriteTableOperationCitations", () => {
  it("strips ungrounded pages from edit_cells", () => {
    const ledger = ledgerWithSearchHit("protocol.pdf", 12);
    expect(
      rewriteTableOperationCitations(
        {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            { row: 1, col: 1, insertText: "Pass [protocol.pdf, p. 104]" },
          ],
        },
        ledger
      )
    ).toEqual({
      kind: "edit_cells",
      tableIndex: 0,
      cells: [{ row: 1, col: 1, insertText: "Pass [protocol.pdf]" }],
    });
  });
});
