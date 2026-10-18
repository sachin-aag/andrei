import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { checkCvpRinseVolumeConsistency } from "./rinse-consistency";
import type { EvaluationContext } from "@/lib/document-types/types";

function cell(text: string): JSONContent {
  return {
    type: "tableCell",
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  };
}

function table(headers: string[], rows: string[][]): JSONContent {
  return {
    type: "table",
    content: [
      { type: "tableRow", content: headers.map(cell) },
      ...rows.map((row) => ({ type: "tableRow", content: row.map(cell) })),
    ],
  };
}

function ctx(rinse: JSONContent, acceptance: JSONContent): EvaluationContext {
  return {
    section: "cvp_acceptance_limits",
    content: { narrative: { type: "doc", content: [acceptance] } },
    dependencies: {
      cvp_rinse_volume: { narrative: { type: "doc", content: [rinse] } },
    },
    report: {} as EvaluationContext["report"],
  };
}

const RINSE_HEADERS = [
  "S. No",
  "Name of the Equipment",
  "Equipment No.",
  "Considered volume",
];
const LIMIT_HEADERS = ["Equipment ID", "Rinse volume (L)", "Final rinse acceptance criteria (ppm)"];

describe("checkCvpRinseVolumeConsistency", () => {
  it("passes when 9.0 and 11.0 name the same litres", () => {
    const result = checkCvpRinseVolumeConsistency(
      ctx(
        table(RINSE_HEADERS, [["1", "Micron filter", "MF-1301", "5 L"]]),
        table(LIMIT_HEADERS, [["MF-1301", "5 L", "0.35 ppm"]])
      )
    );
    expect(result.status).toBe("met");
  });

  it("fails when the considered volume and the rinse limit volume disagree", () => {
    const result = checkCvpRinseVolumeConsistency(
      ctx(
        table(RINSE_HEADERS, [["1", "Micron filter", "MF-1301", "0.3 L"]]),
        table(LIMIT_HEADERS, [["MF-1301", "5 L", "6 ppm"]])
      )
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toContain("MF-1301");
    expect(result.reasoning).toContain("0.3 L");
    expect(result.reasoning).toContain("5 L");
  });

  it("does not fail a blank protocol", () => {
    const result = checkCvpRinseVolumeConsistency(
      ctx(table(RINSE_HEADERS, [["", "", "", ""]]), table(LIMIT_HEADERS, [["", "", ""]]))
    );
    expect(result.status).toBe("met");
  });
});
