import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  UNSOURCED_ASK_CITATION_NOTE,
  rewriteAskAssistantParts,
  rewriteUnsourcedAskCitations,
} from "./ask-citation-rewrite";
import { CitationPageLedger } from "./citation-grounding";

const IQ = "Installation Qualification.PDF";

function ledgerWithIqPiping() {
  const ledger = new CitationPageLedger();
  ledger.record(IQ, 24, "att-iq", {
    quote: "Jacket piping size 3.6 inch inlet. Outlet 14.1. Coil installed.",
  });
  return ledger;
}

describe("rewriteUnsourcedAskCitations", () => {
  it("drops a 24.50 cite on an IQ page that only prints piping sizes", () => {
    const result = rewriteUnsourcedAskCitations(
      `Heat transfer area is 24.50 m² [${IQ}, p. 24].`,
      ledgerWithIqPiping()
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}, p. 24]`);
    expect(result.text).toContain("24.50 m²");
    expect(result.text).toContain(UNSOURCED_ASK_CITATION_NOTE);
  });

  it("keeps a cite when the retrieved quote contains the nearby fact", () => {
    const ledger = new CitationPageLedger();
    ledger.record(IQ, 24, "att-iq", {
      quote: "Heat transfer area 24.50 m² measured on the jacket.",
    });
    const result = rewriteUnsourcedAskCitations(
      `Heat transfer area is 24.50 m² [${IQ}, p. 24].`,
      ledger
    );
    expect(result.dropped).toBe(false);
    expect(result.text).toContain(`[${IQ}, p. 24]`);
    expect(result.text).not.toContain(UNSOURCED_ASK_CITATION_NOTE);
  });

  it("does not keep an invented cite because the number is already in the report table", () => {
    const result = rewriteUnsourcedAskCitations(
      `Table 6 already shows 24.50 m² [${IQ}, p. 24].`,
      ledgerWithIqPiping()
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}, p. 24]`);
  });

  it("drops attachment cites when nothing was retrieved this turn", () => {
    const ledger = new CitationPageLedger();
    const result = rewriteUnsourcedAskCitations(
      `Stage 4 IQ [${IQ}, p. 12] lists the area.`,
      ledger
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}`);
    expect(result.text).toContain(UNSOURCED_ASK_CITATION_NOTE);
  });

  it("leaves appendix-style cites that are not attachment filenames", () => {
    const result = rewriteUnsourcedAskCitations(
      "See [Appendix B, p. 12] for the drawing.",
      ledgerWithIqPiping()
    );
    expect(result.dropped).toBe(false);
    expect(result.text).toContain("[Appendix B, p. 12]");
  });
});

describe("rewriteAskAssistantParts", () => {
  it("rewrites Ask text parts and leaves Agent wrap-up alone", () => {
    const response: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-search_documents",
          toolCallId: "s1",
          state: "output-available",
          input: { query: "piping" },
          output: {
            results: [
              {
                filename: IQ,
                pageNumber: 24,
                attachmentId: "att-iq",
                quote: "Jacket piping size 3.6 inch inlet. Outlet 14.1.",
              },
            ],
          },
        },
        {
          type: "text",
          text: `Heat transfer area is 24.50 m² [${IQ}, p. 24].`,
        },
      ],
    };
    const ask = rewriteAskAssistantParts({
      mode: "plan",
      parts: response.parts,
      history: [],
      response,
    });
    const askText = ask.find((part) => part.type === "text");
    expect(askText && "text" in askText ? askText.text : "").not.toContain(
      `[${IQ}, p. 24]`
    );

    const agent = rewriteAskAssistantParts({
      mode: "agent",
      parts: response.parts,
      history: [],
      response,
    });
    const agentText = agent.find((part) => part.type === "text");
    expect(agentText && "text" in agentText ? agentText.text : "").toContain(
      `[${IQ}, p. 24]`
    );
  });
});
