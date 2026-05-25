import { describe, expect, it } from "vitest";
import {
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
