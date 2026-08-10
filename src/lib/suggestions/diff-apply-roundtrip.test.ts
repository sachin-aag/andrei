import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import { applyAndAcceptRichEdit } from "@/lib/suggestions/locator";
import { applyBlockEdit } from "@/lib/suggestions/block-redraft";
import { diffFieldToEdits, type DiffEdit } from "@/lib/suggestions/diff-redraft";

const R = "diff round-trip";

function flat(doc: JSONContent): string {
  return collapseWhitespace(richJsonToPlainText(doc, { tableFormat: "markdown" })).trim();
}

/** Apply one diff edit through the same paths the accept flow uses. */
function applyEdit(doc: JSONContent, edit: DiffEdit, id: string): JSONContent {
  if (edit.kind === "text") {
    const { status, doc: out } = applyAndAcceptRichEdit(doc, id, {
      anchorText: edit.anchorText,
      deleteText: edit.deleteText,
      insertText: edit.insertText,
      scope: edit.scope,
    });
    expect(status === "located" || status === "append").toBe(true);
    return out;
  }
  const { status, doc: out } = applyBlockEdit(doc, id, {
    op: edit.op,
    anchor: edit.anchor,
    blockIndex: edit.blockIndex,
    proposedMarkdown: edit.proposedMarkdown,
    tableIndex: edit.tableIndex,
    rowIndex: edit.rowIndex,
    rowAnchor: edit.rowAnchor,
  });
  expect(status).toBe("located");
  return out;
}

function roundTrip(currentMd: string, proposedMd: string): { out: JSONContent; edits: DiffEdit[] } {
  const current = markdownToDoc(currentMd);
  const res = diffFieldToEdits(current, proposedMd, R);
  expect(res.strategy).toBe("edits");
  const edits = (res as { edits: DiffEdit[] }).edits;
  let doc = current;
  edits.forEach((edit, i) => {
    doc = applyEdit(doc, edit, `e${i}`);
  });
  return { out: doc, edits };
}

describe("diff → apply round-trip (the reported preventiveActions case)", () => {
  it("updates only the changed cell + paragraph, preserves the rest", () => {
    const current = [
      "The effectiveness of these actions will be verified by checking the SST result within 85.0% to 115.0% across calibrations.",
      "",
      "| Action ID | Preventive Action | Due Date | Status |",
      "| --- | --- | --- | --- |",
      "| PA-01 | Revise the standard operating procedure | 30/04/2026 | Pending |",
      "| PA-02 | Quarterly trend review of calibration data | 30/04/2026 | Ongoing |",
      "",
      "In summary, the root cause was variability in the standard preparation step.",
    ].join("\n");

    // Change PA-01's due date and reword the summary; leave the rest identical.
    const proposed = [
      "The effectiveness of these actions will be verified by checking the SST result within 85.0% to 115.0% across calibrations.",
      "",
      "| Action ID | Preventive Action | Due Date | Status |",
      "| --- | --- | --- | --- |",
      "| PA-01 | Revise the standard operating procedure | 31/05/2026 | Pending |",
      "| PA-02 | Quarterly trend review of calibration data | 30/04/2026 | Ongoing |",
      "",
      "In summary, the root cause was inconsistency in the standard preparation step.",
    ].join("\n");

    const { out, edits } = roundTrip(current, proposed);

    // The narrative was NOT wholesale-replaced — only targeted edits.
    expect(edits.length).toBeGreaterThan(0);
    expect(edits.length).toBeLessThanOrEqual(3);

    const text = flat(out);
    // Unchanged content preserved verbatim.
    expect(text).toContain("The effectiveness of these actions will be verified");
    expect(text).toContain("Quarterly trend review of calibration data");
    expect(text).toContain("30/04/2026"); // PA-02 due date untouched
    // Changed content applied.
    expect(text).toContain("31/05/2026"); // PA-01 due date updated
    expect(text).toContain("inconsistency in the standard preparation step");
    // Old values gone.
    expect(text).not.toContain("variability in the standard preparation step");
  });

  it("round-trips to exactly the proposed content", () => {
    const current = "Alpha paragraph stays.\n\nThe value was 90.0 percent last quarter.";
    const proposed = "Alpha paragraph stays.\n\nThe value was 95.0 percent last quarter.";
    const { out } = roundTrip(current, proposed);
    expect(flat(out)).toBe(flat(markdownToDoc(proposed)));
  });

  it("handles a structural change (paragraph → list) via block render", () => {
    const current = "Keep this intro.\n\nThe actions are step one and step two combined.";
    const proposed = "Keep this intro.\n\n- Step one done first\n- Step two done next";
    const { out, edits } = roundTrip(current, proposed);
    expect(edits.some((e) => e.kind === "block" && e.op === "replace")).toBe(true);
    expect((out.content ?? []).some((n) => n.type === "bulletList")).toBe(true);
    expect(flat(out)).toContain("Keep this intro.");
    expect(flat(out)).not.toContain("step one and step two combined");
  });

  it("adds a table row without rewriting unchanged cells", () => {
    const current = [
      "| Action ID | Preventive Action | Due Date |",
      "| --- | --- | --- |",
      "| PA-01 | Revise the SOP | 30/04/2026 |",
      "| PA-02 | Quarterly trend review | 30/04/2026 |",
    ].join("\n");
    const proposed = [
      "| Action ID | Preventive Action | Due Date |",
      "| --- | --- | --- |",
      "| PA-01 | Revise the SOP | 30/04/2026 |",
      "| PA-02 | Quarterly trend review | 30/04/2026 |",
      "| PA-03 | Retrain analysts on SST | 15/06/2026 |",
    ].join("\n");

    const { out, edits } = roundTrip(current, proposed);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ kind: "block", op: "insertRow" });
    const text = flat(out);
    expect(text).toContain("PA-01");
    expect(text).toContain("PA-02");
    expect(text).toContain("PA-03");
    expect(text).toContain("Retrain analysts on SST");
  });

  it("removes a table row and keeps the others", () => {
    const current = [
      "| Action ID | Due Date |",
      "| --- | --- |",
      "| PA-01 | 30/04/2026 |",
      "| PA-02 | 30/04/2026 |",
      "| PA-03 | 15/06/2026 |",
    ].join("\n");
    const proposed = [
      "| Action ID | Due Date |",
      "| --- | --- |",
      "| PA-01 | 30/04/2026 |",
      "| PA-03 | 15/06/2026 |",
    ].join("\n");

    const { out, edits } = roundTrip(current, proposed);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ kind: "block", op: "deleteRow", rowAnchor: "PA-02" });
    const text = flat(out);
    expect(text).toContain("PA-01");
    expect(text).toContain("PA-03");
    expect(text).not.toContain("PA-02");
  });

  it("applies a cell edit and a new row together", () => {
    const current = [
      "| Action ID | Due Date |",
      "| --- | --- |",
      "| PA-01 | 30/04/2026 |",
      "| PA-02 | 30/04/2026 |",
    ].join("\n");
    const proposed = [
      "| Action ID | Due Date |",
      "| --- | --- |",
      "| PA-01 | 31/05/2026 |",
      "| PA-02 | 30/04/2026 |",
      "| PA-03 | 15/06/2026 |",
    ].join("\n");

    const { out, edits } = roundTrip(current, proposed);
    expect(edits.some((e) => e.kind === "text")).toBe(true);
    expect(edits.some((e) => e.kind === "block" && e.op === "insertRow")).toBe(true);
    const text = flat(out);
    expect(text).toContain("31/05/2026");
    expect(text).toContain("PA-03");
    expect(text).toContain("30/04/2026");
  });
});
