import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import {
  ELR_ATTACHMENTS_HEADERS,
  EMPTY_ELR_CONTENT,
} from "./sections";
import {
  buildElrCitedAttachmentsTable,
  collectElrCitedAttachments,
} from "./cited-attachments";

function narrative(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function tableRows(doc: JSONContent): string[][] {
  const table = doc.content?.find((node) => node.type === "table");
  return (table?.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      flattenForAnchor({ type: "doc", content: cell.content ?? [] }).text.trim()
    )
  );
}

describe("collectElrCitedAttachments", () => {
  it("lists each unique cited file once, preferring a filename with an extension", () => {
    const cited = collectElrCitedAttachments([
      {
        section: "elr_qualification",
        content: {
          narrative: narrative(
            "URS approved [URS-FP-21-006.pdf, p. 3]. Same file again [URS-FP-21-006, p. 4]."
          ),
          table: narrative("Protocol [19063LIVAIQ41.pdf, p. 1]"),
        },
      },
      {
        section: "elr_calibration",
        content: {
          narrative: narrative("Certificate [cal-cert.pdf, p. 2]"),
        },
      },
    ]);
    expect(cited).toEqual([
      { filename: "URS-FP-21-006.pdf", documentRef: "URS-FP-21-006" },
      { filename: "19063LIVAIQ41.pdf", documentRef: "19063LIVAIQ41" },
      { filename: "cal-cert.pdf", documentRef: "cal-cert" },
    ]);
  });

  it("splits a combined source bracket into one row per file", () => {
    const cited = collectElrCitedAttachments([
      {
        section: "elr_monitoring",
        content: {
          narrative: narrative("Limits [em.pdf, p. 1, prqr.pdf, p. 12]"),
        },
      },
    ]);
    expect(cited.map((row) => row.filename)).toEqual(["em.pdf", "prqr.pdf"]);
  });

  it("reads parked Citations: lists the same as inline source brackets", () => {
    const cited = collectElrCitedAttachments([
      {
        section: "elr_objective",
        content: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Periodic review [1]." }],
              },
              { type: "paragraph" },
              {
                type: "paragraph",
                content: [{ type: "text", text: "Citations:" }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "1. [SOP-DP-QA-014.pdf, p. 21]" }],
              },
            ],
          },
        },
      },
    ]);
    expect(cited).toEqual([
      { filename: "SOP-DP-QA-014.pdf", documentRef: "SOP-DP-QA-014" },
    ]);
  });

  it("ignores leftover elr_attachments editor content", () => {
    const cited = collectElrCitedAttachments([
      {
        section: "elr_attachments",
        content: {
          table: narrative("Stale row [ignored.pdf, p. 1]"),
        },
      },
      {
        section: "elr_scope",
        content: { narrative: narrative("Covered [kept.pdf, p. 1]") },
      },
    ]);
    expect(cited.map((row) => row.filename)).toEqual(["kept.pdf"]);
  });
});

describe("buildElrCitedAttachmentsTable", () => {
  it("uses the four export columns and one row per cited file", () => {
    const doc = buildElrCitedAttachmentsTable([
      {
        section: "elr_scope",
        content: { narrative: narrative("See [protocol.pdf, p. 2]") },
      },
    ]);
    const rows = tableRows(doc);
    expect(rows[0]).toEqual([...ELR_ATTACHMENTS_HEADERS]);
    expect(rows[0]).not.toContain("No. of Pages");
    expect(rows[1]).toEqual(["1", "Attachment-1", "protocol.pdf", "protocol"]);
  });

  it("seeds a blank register when nothing is cited", () => {
    const doc = buildElrCitedAttachmentsTable([
      { section: "elr_objective", content: EMPTY_ELR_CONTENT.elr_objective },
    ]);
    const rows = tableRows(doc);
    expect(rows[0]).toEqual([...ELR_ATTACHMENTS_HEADERS]);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.every((cell) => cell === "")).toBe(true);
  });
});
