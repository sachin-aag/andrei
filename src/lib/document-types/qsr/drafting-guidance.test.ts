import { describe, expect, it } from "vitest";
import { QSR_DRAFTING_GUIDANCE } from "./drafting-guidance";

describe("QSR_DRAFTING_GUIDANCE", () => {
  it("requires verbatim URS rows and keyed banner inserts on the RTM", () => {
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Cover-page URS identity (capacity, MOC, equipment ID) may be copied onto the matching row"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("Never merge two requirements");
    expect(QSR_DRAFTING_GUIDANCE).toContain("process → 5.1 Process Requirements");
    expect(QSR_DRAFTING_GUIDANCE).toContain("safety → 5.4 Safety Requirements");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "do not invent equipment or materials the URS does not list"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Never write Complies, bare Section 13, or a stock IQ page"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "do not paste a protocol-to-URS mapping in chat"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "leave those three cells empty for that row"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Search the attached Design / Installation / Operational / Performance Qualification PDFs for each URS row"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("PQ, then OQ, then IQ, then DQ");
    expect(QSR_DRAFTING_GUIDANCE).toContain("running header");
    expect(QSR_DRAFTING_GUIDANCE).toContain("Verified By signature block");
    expect(QSR_DRAFTING_GUIDANCE).toContain("do not add new group rows");
    expect(QSR_DRAFTING_GUIDANCE).toContain("one insert_rows");
    expect(QSR_DRAFTING_GUIDANCE).toContain("Prefer afterRowKey");
    expect(QSR_DRAFTING_GUIDANCE).toContain("Prefer edit_cells rowKey");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Give every cell its own rowKey"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Do not write VFD compatible in place of an RPM number"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Keep a leading minus on a negative temperature"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "A leading tilde is approximate, not a minus"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "do not copy the DQ date or revision onto the URS row"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Use the revision printed on that document (URS 00, not a neighbouring protocol's 01)"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Fill each named column from the source field with the same label"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("Inner Surface area");
    expect(QSR_DRAFTING_GUIDANCE).toContain("Equipment Dimensions (L x W x H)");
  });

  it("pairs protocol and report rows and forbids invented lifecycle types", () => {
    expect(QSR_DRAFTING_GUIDANCE).toContain("Qualification Documents (Table 3)");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "URS, DS, FMEA, DQ, FAT, SAT, IQ, OQ, PQ"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("do not invent FMEA, FAT, or SAT");
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "leaves Document Name, Revision, and Remarks empty"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain(
      "Do not insert a second fully filled report row"
    );
    expect(QSR_DRAFTING_GUIDANCE).toContain("Approved / Complies / Closed");
  });
});
