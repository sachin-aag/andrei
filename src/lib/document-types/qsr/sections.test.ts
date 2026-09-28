import { describe, expect, it } from "vitest";
import {
  emptyQsrContent,
  QSR_OTHER_DETAILS_HEADERS,
  QSR_OTHER_DETAILS_ROWS,
} from "./sections";

function cellText(node: { content?: unknown } | undefined): string {
  return JSON.stringify(node ?? "").replace(/\\n/g, " ");
}

describe("QSR Other Details template", () => {
  it("seeds Table 11 Parameter / Details rows including Type of Agitator and Type of Mechanical Seal", () => {
    expect(QSR_OTHER_DETAILS_HEADERS).toEqual(["Parameter", "Details"]);
    expect(QSR_OTHER_DETAILS_ROWS.map((row) => row[0])).toEqual([
      "Total Heat Transfer Area",
      "Agitator Type",
      "Type of Agitator",
      "Pump Type",
      "Type of Mechanical Seal",
      "Mechanical Seal Flushing Media",
      "Mechanical Seal Flushing Pressure",
      "Mechanical Seal Flushing Flow",
    ]);
    const content = emptyQsrContent("qsr_other_details") as {
      narrative: { content?: Array<{ type?: string; content?: unknown[] }> };
    };
    const blob = cellText(content.narrative);
    expect(blob).toContain("Type of Agitator");
    expect(blob).toContain("Type of Mechanical Seal");
    expect(blob).toContain("Agitator Type");
    expect(blob).not.toMatch(/Cryo-Fix Anchor/);
    expect(blob).not.toMatch(/Double Mechanical Seal/);
  });
});
