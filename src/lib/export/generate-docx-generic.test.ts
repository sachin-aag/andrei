import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "generic-document-template.docx"
);

function genericReport(
  overrides?: Partial<typeof reports.$inferSelect>
): typeof reports.$inferSelect {
  return {
    id: "generic-export-1",
    documentType: "generic_document",
    documentNo: "DOC-100",
    date: new Date("2026-04-08"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {},
    status: "draft",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function bodySection(narrative: JSONContent): ReportSectionRecord[] {
  return [
    {
      id: "sec-body",
      reportId: "generic-export-1",
      section: "body",
      content: { narrative },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

describe("generic document DOCX export", () => {
  it("has a template on disk", () => {
    expect(fs.existsSync(TEMPLATE)).toBe(true);
  });

  it("emits Heading styles, tracked-change marks, and w:trackRevisions", async () => {
    const narrative: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Purpose" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "old",
              marks: [
                {
                  type: suggestionDeleteMarkName,
                  attrs: {
                    id: "c1",
                    authorId: "ai",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
            {
              type: "text",
              text: "new",
              marks: [
                {
                  type: suggestionInsertMarkName,
                  attrs: {
                    id: "c1",
                    authorId: "ai",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const buf = await generateReportDocx({
      report: genericReport(),
      sections: bodySection(narrative),
    });
    const zip = new PizZip(buf);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    const settings = zip.file("word/settings.xml")?.asText() ?? "";

    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain("Purpose");
    expect(xml).toContain("<w:ins ");
    expect(xml).toContain("<w:del ");
    expect(xml).toContain("DOC-100");
    expect(settings).toContain("<w:trackRevisions");
  });
});
