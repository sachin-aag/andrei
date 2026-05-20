import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { narrativeToDocxXml, plainTextToDocxXml } from "@/lib/export/narrative-to-docx-xml";

function textCell(
  type: "tableCell" | "tableHeader",
  text: string,
  attrs?: JSONContent["attrs"]
): JSONContent {
  return {
    type,
    attrs,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function tableRows(xml: string): string[] {
  return [...xml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
}

function cellCount(rowXml: string): number {
  return (rowXml.match(/<w:tc>/g) ?? []).length;
}

describe("narrativeToDocxXml tables", () => {
  it("pins exported rich text runs to the template font", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Narrative text" }],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain(
      '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
    );
    expect(xml).toContain('<w:sz w:val="24"/>');
    expect(xml).toContain('<w:jc w:val="left"/>');
  });

  it("emits Word vertical merge continuation cells for rowspans", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Sr. No."),
                textCell("tableHeader", "Date"),
                textCell("tableHeader", "Time in Hrs."),
                textCell("tableHeader", "Activity"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "1"),
                textCell("tableCell", "20/11/2025", { rowspan: 3 }),
                textCell("tableCell", "01:07"),
                textCell("tableCell", "Chamber cleaning performed"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "2"),
                textCell("tableCell", "02:28"),
                textCell("tableCell", "Hot leak test performed"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "3"),
                textCell("tableCell", "03:09"),
                textCell("tableCell", "Bowie dick test performed"),
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    const rows = tableRows(xml);

    expect(rows).toHaveLength(4);
    expect(rows.map(cellCount)).toEqual([4, 4, 4, 4]);
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml.match(/<w:vMerge w:val="continue"\/>/g)).toHaveLength(2);
  });

  it("uses table.attrs.colWidths for w:tblGrid when length matches logical columns", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { colWidths: [800, 1200] },
          content: [
            {
              type: "tableRow",
              content: [textCell("tableHeader", "A"), textCell("tableHeader", "B")],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(xml).toContain('<w:gridCol w:w="800"/>');
    expect(xml).toContain('<w:gridCol w:w="1200"/>');
  });

  it("defaults w:tblGrid column widths so the sum stays within a Letter content band", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "C1"),
                textCell("tableHeader", "C2"),
                textCell("tableHeader", "C3"),
                textCell("tableHeader", "C4"),
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    const cols = [...xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    expect(cols).toHaveLength(4);
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(9360 + 100);
    expect(sum).toBeGreaterThan(8000);
  });

  it("emits tblHeader, cantSplit, and keepNext on header rows to avoid orphaned headers", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Sr. No."),
                textCell("tableHeader", "Equipment"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "1"),
                textCell("tableCell", "Tunnel"),
              ],
            },
          ],
        },
      ],
    };

    const rows = tableRows(narrativeToDocxXml(doc));
    expect(rows[0]).toContain("<w:tblHeader/>");
    expect(rows[0]).toContain("<w:cantSplit/>");
    expect(rows[0]).toContain("<w:keepNext/>");
    expect(rows[1]).toContain("<w:cantSplit/>");
    expect(rows[1]).not.toContain("<w:tblHeader/>");
    expect(rows[1]).not.toContain("<w:keepNext/>");
  });

  it("marks every tableHeader row as tblHeader, not only row 0", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "NVPC Results", { colspan: 2 }),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Sr. No."),
                textCell("tableHeader", "Result"),
              ],
            },
            {
              type: "tableRow",
              content: [textCell("tableCell", "1"), textCell("tableCell", "Pass")],
            },
          ],
        },
      ],
    };

    const rows = tableRows(narrativeToDocxXml(doc));
    expect(rows[0]).not.toContain("<w:tblHeader/>");
    expect(rows[0]).toContain("<w:keepNext/>");
    expect(rows[1]).toContain("<w:tblHeader/>");
    expect(rows[1]).toContain("<w:keepNext/>");
    expect(rows[2]).not.toContain("<w:keepNext/>");
  });

  it("chains keepNext on all but the last row for small tables", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "A"),
                textCell("tableHeader", "B"),
              ],
            },
            ...Array.from({ length: 6 }, (_, i) => ({
              type: "tableRow" as const,
              content: [
                textCell("tableCell", String(i + 1)),
                textCell("tableCell", `Value ${i + 1}`),
              ],
            })),
          ],
        },
      ],
    };

    const rows = tableRows(narrativeToDocxXml(doc));
    expect(rows).toHaveLength(7);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i]).toContain("<w:keepNext/>");
    }
    expect(rows[6]).not.toContain("<w:keepNext/>");
  });

  it("emits Word gridSpan for colspans", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [textCell("tableHeader", "Wide", { colspan: 2 })],
            },
            {
              type: "tableRow",
              content: [textCell("tableCell", "A"), textCell("tableCell", "B")],
            },
          ],
        },
      ],
    };

    expect(narrativeToDocxXml(doc)).toContain('<w:gridSpan w:val="2"/>');
  });

  it("emits Word numbering for dash and ordered lists", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          attrs: { listStyle: "dash" },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Dash item" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Numbered item" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain('<w:numId w:val="37"/>');
    expect(xml).toContain('<w:numId w:val="35"/>');
    expect(xml).toContain("Dash item");
    expect(xml).toContain("Numbered item");
  });

  it("parses plain text dash lists into numbered Word XML", () => {
    const xml = plainTextToDocxXml("- First\n- Second");
    expect(xml).toContain('<w:numId w:val="37"/>');
    expect(xml).toContain("First");
    expect(xml).toContain("Second");
  });
});
