import { describe, expect, it } from "vitest";
import { flattenDraftingGuidance } from "@/lib/document-types/chat-drafting-guidance";
import {
  QSR_DRAFTING_GUIDANCE,
  QSR_RETRIEVAL_GUIDANCE,
} from "./drafting-guidance";

const guidance = flattenDraftingGuidance(QSR_DRAFTING_GUIDANCE);

describe("QSR_DRAFTING_GUIDANCE", () => {
  it("requires verbatim URS rows and keyed banner inserts on the RTM", () => {
    expect(guidance).toContain(
      "Cover-page URS identity (capacity, MOC, equipment ID) may be copied onto the matching row"
    );
    expect(guidance).toContain("Never merge two requirements");
    expect(guidance).toContain("process → 5.1 Process Requirements");
    expect(guidance).toContain("safety → 5.4 Safety Requirements");
    expect(guidance).toContain(
      "do not invent equipment or materials the URS does not list"
    );
    expect(guidance).toContain(
      "Never write Complies, bare Section 13, or a stock IQ page"
    );
    expect(guidance).toContain("8.2.3 – Heating trial at 8000 L working volume");
    expect(guidance).toContain("13.6 → 13.6 – Gasket material verified as PTFE");
    expect(guidance).toContain("8.2.4 / 8.8 – Agitator speed check");
    expect(guidance).toContain("Never copy the page number (Page 21 of 51)");
    expect(guidance).toContain("never the printed page counter");
    expect(guidance).toContain("12.72 °C");
    expect(guidance).toContain("page that prints that dotted heading");
    expect(guidance).toContain("Type of Agitator");
    expect(guidance).toContain("Type of Mechanical Seal");
    expect(guidance).toContain("do not paste a protocol-to-URS mapping in chat");
    expect(guidance).toContain("write NA in that family cell");
    expect(guidance).toContain(
      "Search the attached Design / Installation / Operational / Performance Qualification PDFs for each URS row"
    );
    expect(guidance).toContain("four family columns");
    expect(guidance).toContain("only the source PDF changes");
    expect(guidance).not.toContain("PQ, then OQ, then IQ, then DQ");
    expect(guidance).toContain("running header");
    expect(guidance).toContain("Verified By signature block");
    expect(guidance).toContain("do not add new group rows");
    expect(guidance).toContain("one insert_rows");
    expect(guidance).toContain("Prefer afterRowKey");
    expect(guidance).toContain("Prefer edit_cells rowKey");
    expect(guidance).toContain("Give every cell its own rowKey");
    expect(guidance).toContain(
      "Do not write VFD compatible in place of an RPM number"
    );
    expect(guidance).toContain("Keep a leading minus on a negative temperature");
    expect(guidance).toContain("A leading tilde is approximate, not a minus");
    expect(guidance).toContain(
      "do not copy the DQ date or revision onto the URS row"
    );
    expect(guidance).toContain(
      "Use the revision printed on that document (URS 00, not a neighbouring protocol's 01)"
    );
    expect(guidance).toContain(
      "Fill each named column from the source field with the same label"
    );
    expect(guidance).toContain("Inner Surface area");
    expect(guidance).toContain("Equipment Dimensions (L x W x H)");
  });

  it("pairs protocol and report rows and forbids invented lifecycle types", () => {
    expect(guidance).toContain("Qualification Documents (Table 3)");
    expect(guidance).toContain("URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ");
    expect(guidance).toContain("do not invent FMEA, FAT, or SAT");
    expect(guidance).toContain(
      "leaves Document Name, Revision, and Remarks empty"
    );
    expect(guidance).toContain("Do not insert a second fully filled report row");
    expect(guidance).toContain("Approved / Complies / Closed");
  });

  it("owns the RTM chat-editing rules and review strategy", () => {
    expect(guidance).toContain("do not copy URS-37's range onto URS-5");
    expect(guidance).toContain(
      "the card copies the grounded family-column / Remarks insertText you already wrote"
    );
    expect(guidance).toContain("Never write `<remarks>` or `<section>`");
    expect(QSR_RETRIEVAL_GUIDANCE.adaptive).toContain(
      "one requirement ID is not one grep"
    );
    expect(QSR_RETRIEVAL_GUIDANCE.adaptive).toContain(
      "A hit on one family is not enough"
    );
    expect(QSR_RETRIEVAL_GUIDANCE.comprehensive).toContain(
      "A 12-page URS is a 12-page walk"
    );
    expect(QSR_RETRIEVAL_GUIDANCE.comprehensive).toContain(
      "do not treat it as a Table 3 cover walk"
    );
  });
});
