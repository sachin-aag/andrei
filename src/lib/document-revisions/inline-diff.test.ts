import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { diffRevisionSnapshots } from "@/lib/document-revisions/inline-diff";

function paraDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function tableDoc(cells: string[][]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: cells.map((row) => ({
          type: "tableRow",
          content: row.map((text) => ({
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: text ? [{ type: "text", text }] : [],
              },
            ],
          })),
        })),
      },
    ],
  };
}

describe("diffRevisionSnapshots", () => {
  it("diffs prose as word-level insert and delete parts", () => {
    const sections = diffRevisionSnapshots({
      documentType: "investigation_report",
      from: [
        {
          section: "define",
          content: { narrative: paraDoc("The assay failed due to temperature.") },
          contentHash: "from",
        },
      ],
      to: [
        {
          section: "define",
          content: { narrative: paraDoc("The assay failed due to humidity.") },
          contentHash: "to",
        },
      ],
    });

    const field = sections.find((row) => row.section === "define")?.fields[0];
    expect(field?.kind).toBe("text");
    const types = (field?.parts ?? []).map((part) => part.type);
    expect(types).toContain("delete");
    expect(types).toContain("insert");
    expect(field?.parts?.some((part) => part.type === "delete" && part.value.includes("temperature"))).toBe(
      true
    );
    expect(field?.parts?.some((part) => part.type === "insert" && part.value.includes("humidity"))).toBe(
      true
    );
  });

  it("diffs a table cell without rewriting unchanged cells", () => {
    const sections = diffRevisionSnapshots({
      documentType: "investigation_report",
      from: [
        {
          section: "define",
          content: {
            narrative: tableDoc([
              ["Cause", "Status"],
              ["temperature", "open"],
            ]),
          },
          contentHash: "from",
        },
      ],
      to: [
        {
          section: "define",
          content: {
            narrative: tableDoc([
              ["Cause", "Status"],
              ["humidity", "open"],
            ]),
          },
          contentHash: "to",
        },
      ],
    });

    const field = sections.find((row) => row.section === "define")?.fields[0];
    expect(field?.kind).toBe("table");
    const rows = field?.table?.rows ?? [];
    expect(rows[0]?.[0]?.parts).toEqual([{ type: "equal", value: "Cause" }]);
    expect(rows[0]?.[1]?.parts).toEqual([{ type: "equal", value: "Status" }]);
    expect(rows[1]?.[1]?.parts).toEqual([{ type: "equal", value: "open" }]);
    expect(
      rows[1]?.[0]?.parts.some(
        (part) => part.type === "delete" && part.value.includes("temperature")
      )
    ).toBe(true);
    expect(
      rows[1]?.[0]?.parts.some(
        (part) => part.type === "insert" && part.value.includes("humidity")
      )
    ).toBe(true);
  });
});
