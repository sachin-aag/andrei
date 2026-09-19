import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  collectElrBibliography,
  ELR_CITATIONS_HEADING,
  elrCitationsAppendixXml,
  insertXmlBeforeLastSectPr,
  unifyElrCitationsForExport,
} from "@/lib/export/elr-unified-citations";
import type { ReportSectionRecord } from "@/types/report";

function paragraph(text?: string): JSONContent {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function citedDoc(body: string, citations: string[]): JSONContent {
  return {
    type: "doc",
    content: [
      paragraph(body),
      paragraph(),
      paragraph("Citations:"),
      ...citations.map((line) => paragraph(line)),
    ],
  };
}

function section(
  key: string,
  content: unknown
): ReportSectionRecord {
  return {
    id: `sec-${key}`,
    reportId: "elr-1",
    section: key as ReportSectionRecord["section"],
    content,
    updatedAt: "2026-03-09T00:00:00.000Z",
  };
}

function bodyText(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((node) =>
      (node.content ?? []).map((child) => (child as { text?: string }).text ?? "").join("")
    )
    .join("\n");
}

describe("unifyElrCitationsForExport", () => {
  it("assigns global numbers in document order and drops per-field lists", () => {
    const sections = [
      section("elr_qualification", {
        narrative: citedDoc("IQ completed [1].", ["1. [iq.pdf, p. 4]"]),
      }),
      section("elr_objective", {
        narrative: citedDoc("The URS was approved [1].", [
          "1. [urs.pdf, p. 2]",
        ]),
      }),
      section("elr_monitoring", {
        narrative: citedDoc("Same URS still applies [1].", [
          "1. [urs.pdf, p. 2]",
        ]),
      }),
    ];

    const { bibliography, sections: next } = unifyElrCitationsForExport(
      sections
    );
    expect(bibliography).toEqual([
      { number: 1, source: "[urs.pdf, p. 2]" },
      { number: 2, source: "[iq.pdf, p. 4]" },
    ]);

    const byKey = Object.fromEntries(next.map((row) => [row.section, row]));
    expect(
      bodyText(
        (byKey.elr_objective?.content as { narrative: JSONContent }).narrative
      )
    ).toBe("The URS was approved [1].");
    expect(
      bodyText(
        (byKey.elr_qualification?.content as { narrative: JSONContent })
          .narrative
      )
    ).toBe("IQ completed [2].");
    expect(
      bodyText(
        (byKey.elr_monitoring?.content as { narrative: JSONContent }).narrative
      )
    ).toBe("Same URS still applies [1].");
    expect(JSON.stringify(next)).not.toContain("Citations:");
  });

  it("keeps independent field numbering from colliding inside one section", () => {
    const { bibliography, sections: next } = unifyElrCitationsForExport([
      section("elr_monitoring", {
        narrative: citedDoc("One excursion [1].", ["1. [em.pdf, p. 1]"]),
        table: citedDoc("DEV-26-011 [1]", ["1. [dev.pdf, p. 3]"]),
      }),
    ]);
    expect(bibliography.map((entry) => entry.source)).toEqual([
      "[em.pdf, p. 1]",
      "[dev.pdf, p. 3]",
    ]);
    const content = next[0]?.content as {
      narrative: JSONContent;
      table: JSONContent;
    };
    expect(bodyText(content.narrative)).toBe("One excursion [1].");
    expect(bodyText(content.table)).toBe("DEV-26-011 [2]");
  });
});

describe("collectElrBibliography", () => {
  it("is empty when no field parked a source", () => {
    expect(
      collectElrBibliography([
        section("elr_objective", {
          narrative: { type: "doc", content: [paragraph("No cites.")] },
        }),
      ])
    ).toEqual([]);
  });
});

describe("elrCitationsAppendixXml", () => {
  it("renders a Heading1 block and numbered sources", () => {
    const xml = elrCitationsAppendixXml([
      { number: 1, source: "[urs.pdf, p. 2]" },
      { number: 2, source: "[iq.pdf, p. 4]" },
    ]);
    expect(xml).toContain(ELR_CITATIONS_HEADING);
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain("1. [urs.pdf, p. 2]");
    expect(xml).toContain("2. [iq.pdf, p. 4]");
    expect(elrCitationsAppendixXml([])).toBe("");
  });
});

describe("insertXmlBeforeLastSectPr", () => {
  it("inserts before the document-level sectPr", () => {
    const xml =
      `<w:document><w:body>` +
      `<w:p><w:r><w:t>Approval</w:t></w:r></w:p>` +
      `<w:sectPr><w:pgSz/></w:sectPr>` +
      `</w:body></w:document>`;
    const out = insertXmlBeforeLastSectPr(
      xml,
      `<w:p><w:r><w:t>10.0 CITATIONS</w:t></w:r></w:p>`
    );
    expect(out.indexOf("10.0 CITATIONS")).toBeGreaterThan(-1);
    expect(out.indexOf("10.0 CITATIONS")).toBeLessThan(out.indexOf("<w:sectPr"));
    expect(out.indexOf("Approval")).toBeLessThan(out.indexOf("10.0 CITATIONS"));
  });
});
