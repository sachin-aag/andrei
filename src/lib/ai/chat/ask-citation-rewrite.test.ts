import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  UNSOURCED_ASK_GROUNDING_NOTE,
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
  it("placeholders 24.50 when the IQ page only prints piping sizes", () => {
    const result = rewriteUnsourcedAskCitations(
      `Heat transfer area is 24.50 m² [${IQ}, p. 24].`,
      ledgerWithIqPiping()
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}, p. 24]`);
    expect(result.text).not.toContain("24.50");
    expect(result.text).toContain("<number>");
    expect(result.text).toContain(UNSOURCED_ASK_GROUNDING_NOTE);
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
    expect(result.text).toContain("24.50 m²");
    expect(result.text).not.toContain(UNSOURCED_ASK_GROUNDING_NOTE);
  });

  it("keeps a report-table number after dropping a fake IQ cite", () => {
    const result = rewriteUnsourcedAskCitations(
      `Table 6 already shows 24.50 m² [${IQ}, p. 24].`,
      ledgerWithIqPiping(),
      { reportHaystack: "Table 6 Heat transfer area 24.50 m²" }
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}, p. 24]`);
    expect(result.text).toContain("24.50 m²");
    expect(result.text).not.toContain("<number>");
  });

  it("keeps a number the engineer stated this turn", () => {
    const result = rewriteUnsourcedAskCitations(
      `Heat transfer area is 24.50 m² [${IQ}, p. 24].`,
      ledgerWithIqPiping(),
      { userHaystack: "the jacket area is 24.50 m², is that in the IQ?" }
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}, p. 24]`);
    expect(result.text).toContain("24.50 m²");
  });

  it("placeholders an uncited invented number after a lookup", () => {
    const result = rewriteUnsourcedAskCitations(
      "Heat transfer area is 24.50 m².",
      ledgerWithIqPiping()
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain("24.50");
    expect(result.text).toContain("<number>");
  });

  it("drops attachment cites and placeholders when nothing was retrieved", () => {
    const ledger = new CitationPageLedger();
    const result = rewriteUnsourcedAskCitations(
      `Stage 4 IQ [${IQ}, p. 12] lists the area as 24.50 m².`,
      ledger
    );
    expect(result.dropped).toBe(true);
    expect(result.text).not.toContain(`[${IQ}`);
    expect(result.text).not.toContain("24.50");
    expect(result.text).toContain("<number>");
    expect(result.text).toContain(UNSOURCED_ASK_GROUNDING_NOTE);
  });

  it("leaves appendix-style cites that are not attachment filenames", () => {
    const result = rewriteUnsourcedAskCitations(
      "See [Appendix B, p. 12] for the drawing.",
      ledgerWithIqPiping()
    );
    expect(result.dropped).toBe(false);
    expect(result.text).toContain("[Appendix B, p. 12]");
  });

  it("fail-opens uncited numbers when nothing was looked up", () => {
    const ledger = new CitationPageLedger();
    const result = rewriteUnsourcedAskCitations(
      "A typical jacket might be 24.50 m².",
      ledger
    );
    expect(result.dropped).toBe(false);
    expect(result.text).toContain("24.50 m²");
  });
});

describe("rewriteAskAssistantParts", () => {
  it("placeholders Ask text and leaves Agent wrap-up alone", () => {
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
    const askBody = askText && "text" in askText ? askText.text : "";
    expect(askBody).not.toContain(`[${IQ}, p. 24]`);
    expect(askBody).not.toContain("24.50");
    expect(askBody).toContain("<number>");

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

  it("keeps a Table 6 number after read_section without a fake IQ cite", () => {
    const response: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-read_section",
          toolCallId: "r1",
          state: "output-available",
          input: { section: "cvrp_1" },
          output: {
            section: "cvrp_1",
            fields: [
              {
                targetField: "table",
                text: "Table 6 Heat transfer area 24.50 m²",
                readingText: "Table 6 Heat transfer area 24.50 m²",
              },
            ],
          },
        },
        {
          type: "text",
          text: `Table 6 already shows 24.50 m² [${IQ}, p. 24].`,
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
    const askBody = askText && "text" in askText ? askText.text : "";
    expect(askBody).not.toContain(`[${IQ}, p. 24]`);
    expect(askBody).toContain("24.50 m²");
  });
});
