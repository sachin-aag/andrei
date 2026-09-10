import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { findPlaceholders, MAX_PLACEHOLDER_LABEL_LENGTH } from "@/lib/placeholders/find";

describe("findPlaceholders", () => {
  it("finds bracketed placeholders with and without angle brackets", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Batch [Batch No.: <to be filled>] and analyst [to be filled].",
            },
          ],
        },
      ],
    };

    const placeholders = findPlaceholders(doc, "define", "narrative");

    expect(placeholders).toMatchObject([
      {
        id: "define-narrative-8",
        section: "define",
        contentPath: "narrative",
        fromPos: 8,
        text: "[Batch No.: <to be filled>]",
      },
      {
        section: "define",
        contentPath: "narrative",
        text: "[to be filled]",
      },
    ]);
  });

  it("finds placeholders split across adjacent text nodes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "CAPA " },
            { type: "text", text: "[CAPA number: <to be filled>]" },
            { type: "text", text: ", assigned to [Responsible person: <to be filled>]." },
          ],
        },
      ],
    };

    const found = findPlaceholders(doc, "improve", "narrative");

    expect(found.map((p) => p.text).sort()).toEqual(
      [
        "[CAPA number: <to be filled>]",
        "[Responsible person: <to be filled>]",
      ].sort()
    );
  });

  it("walks nested text nodes with stable positions", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "No placeholder here." }] },
        { type: "paragraph", content: [{ type: "text", text: "Room [Room ID: <to be filled>]" }] },
      ],
    };

    const [placeholder] = findPlaceholders(doc, "measure", "narrative");

    expect(placeholder).toMatchObject({
      id: "measure-narrative-29",
      fromPos: 29,
      text: "[Room ID: <to be filled>]",
    });
  });

  it("ignores static SOP acceptance criteria wrapped in brackets", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "If results are within the acceptance criteria [TOC of blank water: Not More Than 100 ppb, %CV: Not More Than 5.0%, and SD: Not More Than 0.5 (either %CV or SD should comply)], then suitability shall be performed.",
            },
          ],
        },
      ],
    };

    expect(findPlaceholders(doc, "define", "narrative")).toEqual([]);
  });

  it("treats bracket guidance without to be filled as placeholders but skips numeric citations", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: 'Observed [description of particulate, e.g., fibers] in [number] vials; see ref [12]. Per [SOP No.: <to be filled>]. [Personnel Name(s)] were present.',
            },
          ],
        },
      ],
    };

    const found = findPlaceholders(doc, "define", "narrative");

    expect(found.map((p) => p.text).sort()).toEqual(
      [
        "[Personnel Name(s)]",
        "[SOP No.: <to be filled>]",
        "[description of particulate, e.g., fibers]",
        "[number]",
      ].sort()
    );
  });

  it("treats long AI guidance labels as placeholders only after compaction", () => {
    const long = "[Name/ID of Monitoring System or Refrigerator Unit]";
    expect(long.slice(1, -1).length).toBeGreaterThan(MAX_PLACEHOLDER_LABEL_LENGTH);

    const beforeDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `The affected equipment/system is ${long}.`,
            },
          ],
        },
      ],
    };
    expect(findPlaceholders(beforeDoc, "define", "narrative")).toEqual([]);

    const compacted =
      "[Monitoring System or Refrigerator Unit: <to be filled>]";
    const afterDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `The affected equipment/system is ${compacted}.`,
            },
          ],
        },
      ],
    };
    expect(findPlaceholders(afterDoc, "define", "narrative").map((p) => p.text)).toEqual([
      compacted,
    ]);
  });

  it("does not treat attachment citations as placeholders", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text:
                "as defined in [DV Requriements Convergent Dental.pdf: <to be filled>]. See also [batch-coa.pdf, p. 3], [protocol.docx], [Attachment_XIV, Attachment_VIII], [Attachment_VIII: <to be filled>], [Appendix B DV Report 790-00134R(RevU): <to be filled>], [790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only).docx, p. 1], [790-00134R_Rev_U_Solea_Model_3_Software_: <to be filled>], [me1q4zzhb1me0wwskpmqfw7i: <to be filled>], and [swja2t3b3dif1ua8id1zkyz2,: <to be filled>].",
            },
          ],
        },
      ],
    };
    expect(findPlaceholders(doc, "define", "narrative")).toEqual([]);
  });
});
