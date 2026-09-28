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
    expect(guidance).toContain(
      "do not paste a protocol-to-URS mapping in chat"
    );
    expect(guidance).toContain(
      "leave those three cells empty for that row"
    );
    expect(guidance).toContain(
      "Search the attached Design / Installation / Operational / Performance Qualification PDFs for each URS row"
    );
    expect(guidance).toContain("PQ, then OQ, then IQ, then DQ");
    expect(guidance).toContain("running header");
    expect(guidance).toContain("Verified By signature block");
    expect(guidance).toContain("do not add new group rows");
    expect(guidance).toContain("one insert_rows");
    expect(guidance).toContain("Prefer afterRowKey");
    expect(guidance).toContain("Prefer edit_cells rowKey");
    expect(guidance).toContain(
      "Give every cell its own rowKey"
    );
    expect(guidance).toContain(
      "Do not write VFD compatible in place of an RPM number"
    );
    expect(guidance).toContain(
      "Keep a leading minus on a negative temperature or RPM"
    );
    expect(guidance).toContain(
      "do not copy the DQ date or revision onto the URS row"
    );
    expect(guidance).toContain(
      "Use the revision printed on that document (URS 00, not a neighbouring protocol's 01)"
    );
    expect(guidance).toContain(
      "Fill each named column from the source field with the same label"
    );
  });

  it("pairs protocol and report rows and forbids invented lifecycle types", () => {
    expect(guidance).toContain("Qualification Documents (Table 3)");
    expect(guidance).toContain(
      "URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ"
    );
    expect(guidance).toContain("do not invent FMEA, FAT, or SAT");
    expect(guidance).toContain(
      "leaves Document Name, Revision, and Remarks empty"
    );
    expect(guidance).toContain(
      "Do not insert a second fully filled report row"
    );
    expect(guidance).toContain("Approved / Complies / Closed");
  });

  it("owns the RTM chat-editing rules and review strategy", () => {
    expect(guidance).toContain(
      "do not copy URS-37's range onto URS-5"
    );
    expect(guidance).toContain(
      "including a filled Reference – Section"
    );
    expect(guidance).toContain(
      "Never write `<remarks>`, `<qualification stage>`, or `<section>`"
    );
    expect(QSR_RETRIEVAL_GUIDANCE.adaptive).toContain(
      "one URS ID is not one grep"
    );
    expect(QSR_RETRIEVAL_GUIDANCE.comprehensive).toContain(
      "A 12-page URS is a 12-page walk"
    );
  });
});
