import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  claimWindowForCitation,
  contextLabelsFromText,
  matchClaimToCitedPage,
} from "@/lib/review/checks/citation-support-match";
import { flattenForAnchor } from "@/lib/suggestions/locator";

function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function cell(type: "tableHeader" | "tableCell", text: string): JSONContent {
  return { type, content: [para(text)] };
}

describe("contextLabelsFromText", () => {
  it("picks vessel numbers, URS IDs, and compact equipment IDs", () => {
    const labels = contextLabelsFromText(
      "Vessel 1 jacket 20-25 °C on GLR-1301. URS-5 also applies."
    );
    expect(labels.map((row) => `${row.family}:${row.value}`)).toEqual(
      expect.arrayContaining([
        "vessel:1",
        "equipment:GLR-1301",
        "urs:URS-5",
      ])
    );
    expect(labels.map((row) => row.family)).not.toContain("jacket");
  });
});

describe("matchClaimToCitedPage", () => {
  it("flags a hard fact that is not on the cited page", () => {
    const match = matchClaimToCitedPage(
      "Effective date 06-11-2025 [1]",
      "INSTALLATION QUALIFICATION Effective Date 30-04-2026"
    );
    expect(match).toEqual({ status: "missing_fact", fact: "06-11-2025" });
  });

  it("accepts a date that is on the cited page when the claim names no subject", () => {
    expect(
      matchClaimToCitedPage(
        "Effective date 06-11-2025 [1]",
        "INSTALLATION QUALIFICATION Effective Date 06-11-2025"
      ).status
    ).toBe("supported");
  });

  it("flags a temperature that belongs to a different equipment ID", () => {
    const match = matchClaimToCitedPage(
      "GLR-1301 jacket temperature 80 °C [1]",
      "GLR-1302 jacket temperature 80 °C. GLR-1301 jacket temperature 15 °C."
    );
    expect(match.status).toBe("wrong_context");
    if (match.status === "wrong_context") {
      expect(match.claimLabel.toUpperCase()).toContain("GLR-1301");
      expect(match.pageLabel.toUpperCase()).toContain("GLR-1302");
    }
  });

  it("flags a temperature that belongs to a different vessel on the same page", () => {
    const match = matchClaimToCitedPage(
      "Vessel 1 operating temperature 80 °C [1]",
      "Vessel 2 operating temperature 80 °C. Vessel 1 operating temperature 15 °C."
    );
    expect(match.status).toBe("wrong_context");
    if (match.status === "wrong_context") {
      expect(match.fact).toContain("80");
      expect(match.claimLabel.toLowerCase()).toContain("vessel 1");
      expect(match.pageLabel.toLowerCase()).toContain("vessel 2");
    }
  });

  it("accepts the temperature that sits with the same vessel", () => {
    const match = matchClaimToCitedPage(
      "Vessel 1 operating temperature 15 °C [1]",
      "Vessel 2 operating temperature 80 °C. Vessel 1 operating temperature 15 °C."
    );
    expect(match.status).toBe("supported");
  });

  it("does not copy a neighbour URS temperature onto this row", () => {
    const match = matchClaimToCitedPage(
      "URS-5 Jacket temperature 15–130 °C [1]",
      "URS-5 Jacket temperature 20-25 °C for the jacket loop. URS-37 Process temperature 15–130 °C for the vessel."
    );
    expect(match.status).toBe("wrong_context");
  });

  it("accepts the URS temperature in that ID's sentence", () => {
    const match = matchClaimToCitedPage(
      "URS-5 Jacket temperature 20-25 °C [1]",
      "URS-5 Jacket temperature 20-25 °C for the jacket loop. URS-37 Process temperature 15–130 °C for the vessel."
    );
    expect(match.status).toBe("supported");
  });

  it("asks the model when the page has the number but no subject labels", () => {
    const match = matchClaimToCitedPage(
      "Vessel 1 operating temperature 80 °C [1]",
      "Operating temperature 80 °C recorded during the run."
    );
    expect(match.status).toBe("needs_model");
  });

  it("flags an ID-only claim that lands on a neighbour requirement ID", () => {
    const match = matchClaimToCitedPage(
      "See URS-5 [1]",
      "URS-37 Process temperature 15–130 °C for the vessel."
    );
    expect(match.status).toBe("wrong_context");
  });

  it("asks the model for qualitative claims with no hard facts", () => {
    expect(
      matchClaimToCitedPage(
        "The agitator was verified as installed [1].",
        "Agitator type: anchor. Verified as installed."
      ).status
    ).toBe("needs_model");
  });
});

describe("claimWindowForCitation", () => {
  it("joins a table row with headers so the date keeps its document name", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                cell("tableHeader", "Document Name"),
                cell("tableHeader", "Effective Date"),
                cell("tableHeader", "Remarks"),
              ],
            },
            {
              type: "tableRow",
              content: [
                cell("tableCell", "Design Qualification"),
                cell("tableCell", "06-11-2025 [1]"),
                cell("tableCell", "Approved"),
              ],
            },
          ],
        },
      ],
    };
    const fieldText = flattenForAnchor(doc).text;
    const at = fieldText.indexOf("[1]");
    const claim = claimWindowForCitation(fieldText, at, 3, doc);
    expect(claim).toContain("Document Name: Design Qualification");
    expect(claim).toContain("Effective Date: 06-11-2025 [1]");
  });
});
