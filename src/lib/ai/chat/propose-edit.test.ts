import { describe, expect, it } from "vitest";
import {
  checkProposedEdit,
  proposedEditHint,
} from "@/lib/ai/chat/propose-edit";

const FIELD =
  "The tablet batch failed dissolution testing at 68 percent. The batch was then quarantined pending investigation.";

describe("checkProposedEdit", () => {
  it("accepts a pure end-insert (empty anchor)", () => {
    expect(
      checkProposedEdit(FIELD, { anchorText: "", deleteText: "", insertText: "A new closing sentence." })
    ).toEqual({ status: "ok" });
  });

  it("accepts a uniquely located targeted delete+insert", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "failed dissolution testing at 68 percent",
        deleteText: "68 percent",
        insertText: "68% (spec: NLT 80%)",
      })
    ).toEqual({ status: "ok" });
  });

  it("reports not_found for an anchor that is absent", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "cleanroom differential pressure",
        deleteText: "pressure",
        insertText: "x",
      })
    ).toEqual({ status: "not_found" });
  });

  it("reports ambiguous when the anchor matches more than once", () => {
    const repeated = "test alpha. test beta.";
    expect(
      checkProposedEdit(repeated, { anchorText: "test", deleteText: "test", insertText: "TEST" })
    ).toEqual({ status: "ambiguous" });
  });

  it("accepts a uniquely located rewrite of most of the field (coverage classifies, never rejects)", () => {
    const result = checkProposedEdit(FIELD, {
      anchorText: "",
      deleteText: FIELD,
      insertText: "A complete rewrite of the field.",
    });
    expect(result.status).toBe("ok");
  });

  it("does not flag a small delete as too_large", () => {
    const result = checkProposedEdit(FIELD, {
      anchorText: "then quarantined",
      deleteText: "then ",
      insertText: "",
    });
    expect(result.status).toBe("ok");
  });

  it("accepts a split body change plus end-of-field citation", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "failed dissolution testing at 68 percent",
        deleteText: "",
        insertText: " (spec: NLT 80%)",
        second: {
          anchorText: "",
          deleteText: "",
          insertText: "[protocol.pdf, p. 3]",
        },
      })
    ).toEqual({ status: "ok" });
  });

  it("reports not_found when the citation part cannot be located", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "failed dissolution testing at 68 percent",
        deleteText: "",
        insertText: " (spec: NLT 80%)",
        second: {
          anchorText: "this text is not in the field",
          deleteText: "this text is not in the field",
          insertText: "[protocol.pdf, p. 3]",
        },
      })
    ).toEqual({ status: "not_found" });
  });

  it("refuses a GFM table in insertText", () => {
    expect(
      checkProposedEdit(FIELD, {
        anchorText: "",
        deleteText: "",
        insertText: "| Req | Result |\n| --- | --- |\n| SW-1 | Pass |",
      })
    ).toEqual({ status: "not_found" });
  });

  it("refuses rewriting an existing table as a bulleted list", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Note that Convergent Dental's software version control system (VCS) has four components that uniquely identify the release: mm.nn.ff.bb, as detailed in the table below:",
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: ["Component", "Designation", "Description"].map((text) => ({
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
            {
              type: "tableRow",
              content: ["mm", "Major", "Major release number (01, 02, etc.)"].map(
                (text) => ({
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                })
              ),
            },
            {
              type: "tableRow",
              content: ["nn", "Minor", "Minor release number (01, 02, etc.)"].map(
                (text) => ({
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
                })
              ),
            },
          ],
        },
      ],
    };
    const field =
      "Note that Convergent Dental's software version control system (VCS) has four components that uniquely identify the release: mm.nn.ff.bb, as detailed in the table below: Component Designation Description mm Major Major release number (01, 02, etc.) nn Minor Minor release number (01, 02, etc.)";
    expect(
      checkProposedEdit(
        field,
        {
          anchorText: "as detailed in the table below:",
          deleteText: "as detailed in the table below:",
          insertText:
            "- mm (Major): Major release number (e.g., 04)\n- nn (Minor): Minor release number (e.g., 07)",
        },
        doc
      )
    ).toEqual({ status: "table_as_list" });
  });

  it("still allows a short prose example next to a table", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Note that Convergent Dental's software version control system (VCS) has four components that uniquely identify the release: mm.nn.ff.bb, as detailed in the table below:",
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Component" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const field =
      "Note that Convergent Dental's software version control system (VCS) has four components that uniquely identify the release: mm.nn.ff.bb, as detailed in the table below:";
    expect(
      checkProposedEdit(
        field,
        {
          anchorText: "mm.nn.ff.bb, as detailed in the table below:",
          deleteText: "mm.nn.ff.bb, as detailed in the table below:",
          insertText: "mm.nn.ff.bb (for example, version 4.7.1.1011), as detailed in the table below:",
        },
        doc
      )
    ).toEqual({ status: "ok" });
  });
});

describe("proposedEditHint", () => {
  it("returns an empty string for ok and actionable text otherwise", () => {
    expect(proposedEditHint({ status: "ok" })).toBe("");
    expect(proposedEditHint({ status: "ambiguous" })).toMatch(/unique/i);
    expect(proposedEditHint({ status: "not_found" })).toMatch(/read_section/i);
  });

  it("routes markdown-pipe table misses to edit_table", () => {
    const hint = proposedEditHint(
      { status: "not_found" },
      {
        anchorText: "| Equipment | Manufacturer |\n| --- | --- |\n| UUT-1 | Acme |",
      }
    );
    expect(hint).toMatch(/edit_table/);
    expect(hint).not.toMatch(/draft_field for that field/i);
  });

  it("routes a GFM table in insertText to create_table", () => {
    const hint = proposedEditHint(
      { status: "not_found" },
      {
        insertText: "| Equipment | Manufacturer |\n| --- | --- |\n| UUT-1 | Acme |",
      }
    );
    expect(hint).toMatch(/create_table/);
    expect(hint).not.toMatch(/draft_field for that field/i);
  });

  it("routes table-as-list rewrites to edit_table", () => {
    expect(proposedEditHint({ status: "table_as_list" })).toMatch(/edit_table/);
    expect(proposedEditHint({ status: "table_as_list" })).toMatch(/bulleted list/);
  });
});
