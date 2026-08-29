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

    const fields = sections.find((row) => row.section === "define")?.fields ?? [];
    expect(fields).toHaveLength(1);
    const field = fields[0];
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

  it("diffs every table by index and keeps surrounding prose", () => {
    const from = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Opening temperature." }],
        },
        ...tableDoc([
          ["Cause", "Status"],
          ["hold", "open"],
        ]).content!,
        tableDoc([
          ["Lot", "Result"],
          ["A", "pass"],
        ]).content![0]!,
      ],
    } satisfies JSONContent;
    const to = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Opening humidity." }],
        },
        ...tableDoc([
          ["Cause", "Status"],
          ["hold", "open"],
        ]).content!,
        tableDoc([
          ["Lot", "Result"],
          ["A", "fail"],
        ]).content![0]!,
      ],
    } satisfies JSONContent;

    const sections = diffRevisionSnapshots({
      documentType: "investigation_report",
      from: [{ section: "define", content: { narrative: from }, contentHash: "from" }],
      to: [{ section: "define", content: { narrative: to }, contentHash: "to" }],
    });

    const fields = sections.find((row) => row.section === "define")?.fields ?? [];
    expect(fields.map((field) => [field.targetField, field.kind])).toEqual([
      ["narrative · table 2", "table"],
      ["narrative", "text"],
    ]);
    const tableField = fields.find((field) => field.kind === "table");
    expect(
      tableField?.table?.rows[1]?.[1]?.parts.some(
        (part) => part.type === "insert" && part.value.includes("fail")
      )
    ).toBe(true);
    const textField = fields.find((field) => field.kind === "text");
    expect(
      textField?.parts?.some(
        (part) => part.type === "delete" && part.value.includes("temperature")
      )
    ).toBe(true);
    expect(
      textField?.parts?.some((part) => part.value.includes("hold"))
    ).toBe(false);
  });

  it("lists added and removed figures", () => {
    const from = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: "https://example.com/old.png", alt: "Old plot" },
            },
          ],
        },
      ],
    } satisfies JSONContent;
    const to = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: "https://example.com/new.png", alt: "New plot" },
            },
          ],
        },
      ],
    } satisfies JSONContent;

    const sections = diffRevisionSnapshots({
      documentType: "investigation_report",
      from: [{ section: "define", content: { narrative: from }, contentHash: "from" }],
      to: [{ section: "define", content: { narrative: to }, contentHash: "to" }],
    });

    const field = sections.find((row) => row.section === "define")?.fields[0];
    expect(field).toEqual({
      targetField: "narrative · figures",
      kind: "images",
      images: [
        {
          change: "added",
          src: "https://example.com/new.png",
          alt: "New plot",
        },
        {
          change: "removed",
          src: "https://example.com/old.png",
          alt: "Old plot",
        },
      ],
    });
  });
});
