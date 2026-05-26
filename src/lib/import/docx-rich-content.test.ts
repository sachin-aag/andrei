import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  dedupeSupersetNarrativeParagraphsForTest,
  findParsedParagraphMatchForTest,
  parseParagraphXmlForTest,
  plainTextMatchesForTest,
} from "@/lib/import/docx-rich-content";

describe("parseParagraphXmlForTest", () => {
  it("parses subscript runs from OOXML", () => {
    const pXml =
      '<w:p><w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r></w:p>';
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts).toEqual([
      {
        kind: "text",
        text: "2",
        bold: false,
        italic: false,
        underline: false,
        subscript: true,
        superscript: false,
      },
    ]);
  });

  it("parses bold, italic, and underline runs from OOXML", () => {
    const pXml =
      '<w:p>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>Italic</w:t></w:r>' +
      '<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Underline</w:t></w:r>' +
      "</w:p>";
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts[0]).toMatchObject({
      kind: "text",
      text: "Bold",
      bold: true,
      italic: false,
      underline: false,
    });
    expect(parsed.parts[1]).toMatchObject({
      kind: "text",
      text: "Italic",
      bold: false,
      italic: true,
      underline: false,
    });
    expect(parsed.parts[2]).toMatchObject({
      kind: "text",
      text: "Underline",
      bold: false,
      italic: false,
      underline: true,
    });
  });

  it("parses colored text runs from OOXML", () => {
    const pXml =
      '<w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>Red text</w:t></w:r></w:p>';
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts[0]).toMatchObject({
      kind: "text",
      text: "Red text",
      color: "#ff0000",
    });
  });

  it("ignores paragraph default color leaked by loose run matching", () => {
    const pXml =
      "<w:p>" +
      '<w:pPr><w:rPr><w:color w:val="EE0000"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>Body text</w:t></w:r>' +
      "</w:p>";
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    const part = parsed.parts[0];
    expect(part).toMatchObject({ kind: "text", text: "Body text" });
    expect(part && part.kind === "text" ? part.color : undefined).toBeUndefined();
  });

  it("preserves explicit run red (e.g. cross-reference EE0000)", () => {
    const pXml =
      '<w:p><w:r><w:rPr><w:color w:val="EE0000"/></w:rPr><w:t>Refer Attachment I.</w:t></w:r></w:p>';
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts[0]).toMatchObject({
      kind: "text",
      text: "Refer Attachment I.",
      color: "#ee0000",
    });
  });

  it("does not inherit paragraph default color onto runs without run-level color", () => {
    const pXml =
      "<w:p>" +
      '<w:pPr><w:rPr><w:color w:val="EE0000"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Black body text</w:t></w:r>' +
      "</w:p>";
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    const part = parsed.parts[0];
    expect(part).toMatchObject({ kind: "text", text: "Black body text" });
    expect(part && part.kind === "text" ? part.color : undefined).toBeUndefined();
  });

  it("uses the last w:color in run properties when duplicates exist", () => {
    const pXml =
      "<w:p>" +
      '<w:r><w:rPr><w:color w:val="EE0000"/><w:color w:val="0070C0"/></w:rPr><w:t>Blue</w:t></w:r>' +
      "</w:p>";
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts[0]).toMatchObject({
      kind: "text",
      text: "Blue",
      color: "#0070c0",
    });
  });

  it("parses superscript runs from OOXML", () => {
    const pXml =
      '<w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r></w:p>';
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts[0]).toMatchObject({
      kind: "text",
      text: "2",
      superscript: true,
    });
  });

  it("parses subscript CPH from a split Word run", () => {
    const pXml =
      "<w:p>" +
      '<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">Model No. TOC-L </w:t></w:r>' +
      '<w:r><w:rPr><w:sz w:val="24"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>CPH</w:t></w:r>' +
      '<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t> with LabSolutions</w:t></w:r>' +
      "</w:p>";
    const parsed = parseParagraphXmlForTest(pXml, new Map());
    expect(parsed.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "text", text: "CPH", subscript: true }),
      ])
    );
  });

  it("prefers the longest matching OOXML paragraph when Word repeats a stub", () => {
    const stub =
      "Based on the reported nonconformance, verified the analyst workbench for standard preparation and noted that analyst prepared the sucrose stock standard solution (50000 ppb) in 100 ml volumetric flask.";
    const full = `${stub} Refer Attachment I.`;
    const parsed = [
      { plainText: stub, parts: [{ kind: "text" as const, text: stub }], isMathBlock: false },
      {
        plainText: full,
        parts: [
          { kind: "text" as const, text: stub },
          {
            kind: "text" as const,
            text: " Refer Attachment I.",
            color: "#ee0000",
          },
        ],
        isMathBlock: false,
      },
    ];
    const match = findParsedParagraphMatchForTest(stub, parsed, new Set(), 0);
    expect(match?.index).toBe(1);
    expect(match?.matched.plainText).toBe(full);
  });

  it("removes stub narrative paragraphs superseded by a longer duplicate", () => {
    const stub =
      "Based on the reported nonconformance, verified the analyst workbench for standard preparation and noted that analyst prepared the sucrose stock standard solution (50000 ppb) in 100 ml volumetric flask.";
    const full = `${stub} Refer Attachment I.`;
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: stub }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: stub },
            {
              type: "text",
              text: " Refer Attachment I.",
              marks: [{ type: "textStyle", attrs: { color: "#ee0000" } }],
            },
          ],
        },
      ],
    };
    dedupeSupersetNarrativeParagraphsForTest(doc);
    expect(doc.content).toHaveLength(1);
    expect(doc.content?.[0]?.content?.[1]?.marks?.[0]?.type).toBe("textStyle");
  });

  it("matches mammoth image placeholders to OOXML equations", () => {
    expect(plainTextMatchesForTest("[equation]", "[image]")).toBe(true);
    expect(
      plainTextMatchesForTest(
        "Calculated the TOC of blank water as per formula. [equation]",
        "Calculated the TOC of blank water as per formula. [image]"
      )
    ).toBe(true);
  });

  it("parses VML image fallbacks from OOXML runs", () => {
    const dataUrl = "data:image/png;base64,abc";
    const pXml =
      '<w:p><w:r><w:pict><v:shape style="width:216pt;height:24pt"><v:imagedata r:id="rId9"/></v:shape></w:pict></w:r></w:p>';
    const parsed = parseParagraphXmlForTest(
      pXml,
      new Map([["rId9", { dataUrl, mime: "image/png" }]])
    );

    expect(parsed.plainText).toBe("[image]");
    expect(parsed.parts[0]).toMatchObject({
      kind: "image",
      dataUrl,
      mime: "image/png",
      width: 288,
    });
  });
});
